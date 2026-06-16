import fs from "fs/promises"
import path from "path"
import { makeId, nowIso } from "@/lib/server/ids"
import { callChatCompletion, getConfig } from "@/lib/server/llm"
import { parseJsonFromModel } from "@/lib/server/llm-json"
import { getDataRoot } from "@/lib/server/paths"
import type {
  Message,
  UserMemoryCandidate,
  UserMemoryItem,
  UserMemoryScope,
  UserMemoryStore,
  UserMemoryUsageSnapshot,
} from "@/lib/types"

const USER_MEMORY_FILE = "user-memory.json"
const MAX_MEMORY_TEXT_CHARS = 360
const MAX_REASON_CHARS = 360
const MAX_TAGS = 8
const MAX_CANDIDATES = 40
const DEFAULT_PROMPT_MEMORY_LIMIT = 10

export interface UserMemoryPayload {
  store: UserMemoryStore
  applicable: UserMemoryUsageSnapshot[]
  candidates: UserMemoryCandidate[]
}

export interface UserMemoryPromptState {
  context: string
  items: UserMemoryItem[]
  usedMemory: UserMemoryUsageSnapshot[]
}

export interface CreateUserMemoryInput {
  text: string
  scope?: UserMemoryScope
  bookId?: string
  tags?: string[]
  enabled?: boolean
  source?: UserMemoryItem["source"]
}

export interface UpdateUserMemoryInput {
  id: string
  text?: string
  enabled?: boolean
  scope?: UserMemoryScope
  bookId?: string
  tags?: string[]
}

export interface UpdateUserMemoryCandidateInput {
  id: string
  text?: string
  reason?: string
  scope?: UserMemoryScope
  bookId?: string
  tags?: string[]
}

function memoryPath(): string {
  return path.join(getDataRoot(), USER_MEMORY_FILE)
}

function emptyStore(ts = nowIso()): UserMemoryStore {
  return {
    enabled: true,
    items: [],
    candidates: [],
    updatedAt: ts,
  }
}

async function writeStore(store: UserMemoryStore): Promise<UserMemoryStore> {
  const target = memoryPath()
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${JSON.stringify(store, null, 2)}\n`, "utf-8")
  return store
}

export async function getUserMemoryStore(): Promise<UserMemoryStore> {
  try {
    const raw = await fs.readFile(memoryPath(), "utf-8")
    return normalizeStore(JSON.parse(raw))
  } catch {
    return emptyStore()
  }
}

export async function getUserMemoryPayload(bookId?: string, userMessage = ""): Promise<UserMemoryPayload> {
  const store = await getUserMemoryStore()
  const applicable = store.enabled
    ? snapshotUserMemoryItems(selectUserMemoryItems(store.items, { bookId, userMessage }))
    : []
  return {
    store,
    applicable,
    candidates: store.candidates,
  }
}

export async function setUserMemoryStoreEnabled(enabled: boolean): Promise<UserMemoryStore> {
  const store = await getUserMemoryStore()
  return writeStore({
    ...store,
    enabled,
    updatedAt: nowIso(),
  })
}

export async function createUserMemoryItem(input: CreateUserMemoryInput): Promise<UserMemoryStore> {
  const store = await getUserMemoryStore()
  const ts = nowIso()
  const item = normalizeItem({
    id: makeId("mem"),
    text: input.text,
    enabled: input.enabled ?? true,
    scope: input.scope ?? "global",
    bookId: input.scope === "book" ? input.bookId : undefined,
    tags: input.tags ?? [],
    source: input.source,
    createdAt: ts,
    updatedAt: ts,
  })
  if (!item) throw new Error("memory text is required")

  return writeStore({
    ...store,
    items: dedupeMemoryItems([...store.items, item]),
    updatedAt: ts,
  })
}

export async function updateUserMemoryItem(input: UpdateUserMemoryInput): Promise<UserMemoryStore> {
  const store = await getUserMemoryStore()
  const ts = nowIso()
  let found = false
  const items = store.items.flatMap((item) => {
    if (item.id !== input.id) return [item]
    found = true
    const next = normalizeItem({
      ...item,
      text: input.text ?? item.text,
      enabled: input.enabled ?? item.enabled,
      scope: input.scope ?? item.scope,
      bookId: input.scope === "global" ? undefined : input.bookId ?? item.bookId,
      tags: input.tags ?? item.tags,
      updatedAt: ts,
    })
    return next ? [next] : []
  })
  if (!found) throw new Error("memory item not found")
  return writeStore({
    ...store,
    items: dedupeMemoryItems(items),
    updatedAt: ts,
  })
}

export async function deleteUserMemoryItem(id: string): Promise<UserMemoryStore> {
  const store = await getUserMemoryStore()
  const ts = nowIso()
  return writeStore({
    ...store,
    items: store.items.filter((item) => item.id !== id),
    updatedAt: ts,
  })
}

export async function updateUserMemoryCandidate(input: UpdateUserMemoryCandidateInput): Promise<UserMemoryStore> {
  const store = await getUserMemoryStore()
  const ts = nowIso()
  let found = false
  const candidates = store.candidates.flatMap((candidate) => {
    if (candidate.id !== input.id) return [candidate]
    found = true
    const next = normalizeCandidate({
      ...candidate,
      text: input.text ?? candidate.text,
      reason: input.reason ?? candidate.reason,
      scope: input.scope ?? candidate.scope,
      bookId: input.scope === "global" ? undefined : input.bookId ?? candidate.bookId,
      tags: input.tags ?? candidate.tags,
      updatedAt: ts,
    })
    return next ? [next] : []
  })
  if (!found) throw new Error("memory candidate not found")
  return writeStore({
    ...store,
    candidates,
    updatedAt: ts,
  })
}

export async function acceptUserMemoryCandidate(input: UpdateUserMemoryCandidateInput): Promise<UserMemoryStore> {
  const store = await getUserMemoryStore()
  const candidate = store.candidates.find((item) => item.id === input.id)
  if (!candidate) throw new Error("memory candidate not found")
  const ts = nowIso()
  const item = normalizeItem({
    id: makeId("mem"),
    text: input.text ?? candidate.text,
    enabled: true,
    scope: input.scope ?? candidate.scope,
    bookId: input.scope === "global" ? undefined : input.bookId ?? candidate.bookId,
    tags: input.tags ?? candidate.tags,
    source: candidate.source,
    createdAt: ts,
    updatedAt: ts,
  })
  if (!item) throw new Error("memory text is required")

  return writeStore({
    ...store,
    items: dedupeMemoryItems([...store.items, item]),
    candidates: store.candidates.filter((candidateItem) => candidateItem.id !== input.id),
    updatedAt: ts,
  })
}

export async function deleteUserMemoryCandidate(id: string): Promise<UserMemoryStore> {
  const store = await getUserMemoryStore()
  const ts = nowIso()
  return writeStore({
    ...store,
    candidates: store.candidates.filter((candidate) => candidate.id !== id),
    updatedAt: ts,
  })
}

export async function resolveUserMemoryForPrompt(input: {
  bookId?: string
  userMessage: string
  limit?: number
}): Promise<UserMemoryPromptState> {
  const store = await getUserMemoryStore()
  if (!store.enabled) {
    return { context: "", items: [], usedMemory: [] }
  }
  const items = selectUserMemoryItems(store.items, {
    bookId: input.bookId,
    userMessage: input.userMessage,
    limit: input.limit ?? DEFAULT_PROMPT_MEMORY_LIMIT,
  })
  return {
    context: formatUserMemoryForPrompt(items),
    items,
    usedMemory: snapshotUserMemoryItems(items),
  }
}

export async function extractUserMemoryCandidates(input: {
  bookId?: string
  threadId: string
  messages: Message[]
}): Promise<UserMemoryStore> {
  const config = getConfig()
  if (!config) throw new Error("当前模型不可用，无法提炼 memory 候选。")

  const recentMessages = input.messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-12)
  if (recentMessages.length === 0) {
    return getUserMemoryStore()
  }

  const response = await callChatCompletion(config, [
    {
      role: "system",
      content: [
        "你只提取用户希望产品长期配合他的协作偏好，不提取项目事实。",
        "可以提取沟通偏好、工作流偏好、写作/改稿默认偏好、明确纠正、明确禁止事项。",
        "不要提取剧情、设定、角色、章节正文、文件事实、临时任务进度或未经用户确认的推断。",
        "只输出 JSON 对象，格式为 {\"candidates\":[{\"text\":\"...\",\"reason\":\"...\",\"tags\":[\"communication\"]}]}。",
        "候选最多 5 条；没有合适内容时输出 {\"candidates\":[]}.",
      ].join("\n"),
    },
    {
      role: "user",
      content: renderRecentMessagesForExtraction(recentMessages),
    },
  ], {
    temperature: 0.1,
    maxTokens: 1200,
    feature: "user_memory_extract",
  })

  const parsed = parseJsonFromModel(response.content)
  const source = {
    threadId: input.threadId,
    messageIds: recentMessages.map((message) => message.id),
  }
  const extracted = parseExtractedCandidates(parsed, input.bookId, source)
  if (extracted.length === 0) return getUserMemoryStore()

  const store = await getUserMemoryStore()
  const ts = nowIso()
  return writeStore({
    ...store,
    candidates: dedupeCandidates([...extracted, ...store.candidates]).slice(0, MAX_CANDIDATES),
    updatedAt: ts,
  })
}

export function formatUserMemoryForPrompt(items: UserMemoryItem[]): string {
  if (items.length === 0) return ""
  return [
    "NG_USER_MEMORY:",
    "用户保存的长期偏好：",
    "以下内容只影响协作方式和默认行为；不覆盖本轮明确请求，不作为项目事实。",
    ...items.map((item) => {
      const scope = item.scope === "book" ? "book" : "global"
      const tags = item.tags.length ? ` #${item.tags.join(" #")}` : ""
      return `- [${scope}] ${item.text}${tags}`
    }),
  ].join("\n")
}

function selectUserMemoryItems(
  items: UserMemoryItem[],
  input: { bookId?: string; userMessage?: string; limit?: number },
): UserMemoryItem[] {
  const applicable = items.filter((item) => {
    if (!item.enabled) return false
    if (item.scope === "global") return true
    return Boolean(input.bookId && item.bookId === input.bookId)
  })
  const limit = input.limit ?? DEFAULT_PROMPT_MEMORY_LIMIT
  if (applicable.length <= limit) return applicable

  const queryTerms = extractSearchTerms(input.userMessage ?? "")
  return [...applicable]
    .sort((a, b) => {
      const scoreDiff = scoreMemoryItem(b, queryTerms, input.bookId) - scoreMemoryItem(a, queryTerms, input.bookId)
      if (scoreDiff !== 0) return scoreDiff
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    .slice(0, limit)
}

function scoreMemoryItem(item: UserMemoryItem, queryTerms: string[], bookId?: string): number {
  let score = item.scope === "book" && item.bookId === bookId ? 4 : 0
  const haystack = `${item.text} ${item.tags.join(" ")}`.toLowerCase()
  for (const term of queryTerms) {
    if (haystack.includes(term)) score += 2
  }
  for (const tag of item.tags) {
    if (queryTerms.includes(tag.toLowerCase())) score += 3
  }
  return score
}

function snapshotUserMemoryItems(items: UserMemoryItem[]): UserMemoryUsageSnapshot[] {
  return items.map((item) => ({
    id: item.id,
    text: item.text,
    scope: item.scope,
    bookId: item.bookId,
    tags: item.tags,
  }))
}

function parseExtractedCandidates(
  value: unknown,
  bookId: string | undefined,
  source: UserMemoryCandidate["source"],
): UserMemoryCandidate[] {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const rawCandidates = Array.isArray(record.candidates) ? record.candidates : []
  const ts = nowIso()
  return rawCandidates
    .slice(0, 5)
    .flatMap((raw) => {
      const candidate = normalizeCandidate({
        id: makeId("memcand"),
        text: isRecord(raw) ? raw.text : "",
        reason: isRecord(raw) ? raw.reason : "",
        scope: "global",
        bookId,
        tags: isRecord(raw) ? raw.tags : [],
        source,
        createdAt: ts,
        updatedAt: ts,
      })
      return candidate && isLikelyUserPreference(candidate.text) ? [candidate] : []
    })
}

function normalizeStore(value: unknown): UserMemoryStore {
  const raw = value && typeof value === "object" ? value as Partial<UserMemoryStore> : {}
  const ts = nowIso()
  return {
    enabled: raw.enabled !== false,
    items: Array.isArray(raw.items)
      ? dedupeMemoryItems(raw.items.flatMap((item) => {
          const normalized = normalizeItem(item)
          return normalized ? [normalized] : []
        }))
      : [],
    candidates: Array.isArray(raw.candidates)
      ? dedupeCandidates(raw.candidates.flatMap((item) => {
          const normalized = normalizeCandidate(item)
          return normalized ? [normalized] : []
        }))
      : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : ts,
  }
}

function normalizeItem(value: unknown): UserMemoryItem | null {
  if (!isRecord(value)) return null
  const text = normalizeText(value.text, MAX_MEMORY_TEXT_CHARS)
  if (!text) return null
  const scope = normalizeScope(value.scope)
  return {
    id: typeof value.id === "string" && value.id ? value.id : makeId("mem"),
    text,
    enabled: value.enabled !== false,
    scope,
    bookId: scope === "book" && typeof value.bookId === "string" && value.bookId.trim()
      ? value.bookId.trim()
      : undefined,
    tags: normalizeTags(value.tags),
    source: normalizeSource(value.source),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
  }
}

function normalizeCandidate(value: unknown): UserMemoryCandidate | null {
  if (!isRecord(value)) return null
  const text = normalizeText(value.text, MAX_MEMORY_TEXT_CHARS)
  if (!text) return null
  const scope = normalizeScope(value.scope)
  return {
    id: typeof value.id === "string" && value.id ? value.id : makeId("memcand"),
    text,
    reason: normalizeText(value.reason, MAX_REASON_CHARS),
    scope,
    bookId: scope === "book" && typeof value.bookId === "string" && value.bookId.trim()
      ? value.bookId.trim()
      : undefined,
    tags: normalizeTags(value.tags),
    source: normalizeSource(value.source),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
  }
}

function normalizeScope(value: unknown): UserMemoryScope {
  return value === "book" ? "book" : "global"
}

function normalizeSource(value: unknown): UserMemoryItem["source"] | undefined {
  if (!isRecord(value) || typeof value.threadId !== "string" || !Array.isArray(value.messageIds)) return undefined
  const messageIds = value.messageIds.filter((id): id is string => typeof id === "string" && Boolean(id))
  if (messageIds.length === 0) return undefined
  return {
    threadId: value.threadId,
    messageIds,
  }
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of value) {
    const tag = normalizeText(item, 32).toLowerCase().replace(/^#/, "")
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

function normalizeText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return ""
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxChars ? normalized.slice(0, maxChars).trim() : normalized
}

function dedupeMemoryItems(items: UserMemoryItem[]): UserMemoryItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.text.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeCandidates(candidates: UserMemoryCandidate[]): UserMemoryCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = candidate.text.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function renderRecentMessagesForExtraction(messages: Message[]): string {
  return messages.map((message) => {
    const role = message.role === "user" ? "用户" : "助手"
    return `### ${role} (${message.id})\n${clipText(message.content, message.role === "assistant" ? 1800 : 1200)}`
  }).join("\n\n")
}

function clipText(value: string, maxChars: number): string {
  const normalized = value.trim()
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars).trim()}...` : normalized
}

function isLikelyUserPreference(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  const hasPreferenceSignal = /(用户|以后|长期|默认|希望|偏好|喜欢|倾向|请|不要|避免|必须|需要|优先|回答|讨论|改稿|写作|沟通|协作)/.test(normalized)
  if (!hasPreferenceSignal) return false
  const looksLikeProjectFact = /(剧情是|角色是|主角是|设定为|世界观是|章节内容|正文|文件路径|canon\/|drafts\/|NOVEL\.md)/i.test(normalized)
  return !looksLikeProjectFact
}

function extractSearchTerms(value: string): string[] {
  return [...new Set(
    (value.toLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fa5]{2,}/g) ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 24),
  )]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
