import fs from "fs/promises"
import path from "path"
import type { AgentEvent, Message, Thread, Turn } from "@/lib/types"
import { makeId, nowIso } from "@/lib/server/ids"
import { appendJsonlFile, readJsonlFile } from "@/lib/server/jsonl"
import { getBookDir } from "@/lib/server/paths"

const THREADS_FILE = "threads.json"
const TURNS_FILE = "turns.jsonl"
const MESSAGES_FILE = "thread-messages.jsonl"

type TurnIndex = {
  all: Turn[]
  byId: Map<string, Turn>
  byThread: Map<string, Turn[]>
}

type MessageIndex = {
  visible: Message[]
  byThread: Map<string, Message[]>
}

const turnIndexCache = new WeakMap<Turn[], TurnIndex>()
const messageIndexCache = new WeakMap<Message[], MessageIndex>()

function filePath(bookId: string, fileName: string): string {
  return path.join(getBookDir(bookId), fileName)
}

function normalizeThread(bookId: string, thread: Partial<Thread> & { id: string }): Thread {
  const ts = nowIso()
  return {
    bookId,
    title: "默认任务线程",
    status: "active",
    createdAt: ts,
    updatedAt: ts,
    ...thread,
  }
}

async function readJsonl<T>(bookId: string, fileName: string): Promise<T[]> {
  return readJsonlFile(filePath(bookId, fileName))
}

async function appendJsonl<T>(bookId: string, fileName: string, items: T[]): Promise<void> {
  await appendJsonlFile(filePath(bookId, fileName), items)
}

async function saveThreads(bookId: string, threads: Thread[]): Promise<void> {
  const target = filePath(bookId, THREADS_FILE)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(threads, null, 2), "utf-8")
}

function indexTurns(records: Turn[]): TurnIndex {
  const cached = turnIndexCache.get(records)
  if (cached) return cached

  const byId = new Map<string, Turn>()
  for (const record of records) {
    if (!record.id || !record.threadId) continue
    const existing = byId.get(record.id)
    byId.set(record.id, existing ? { ...existing, ...record } : record)
  }

  const all = [...byId.values()]
  const byThread = new Map<string, Turn[]>()
  for (const turn of all) {
    const bucket = byThread.get(turn.threadId) ?? []
    bucket.push(turn)
    byThread.set(turn.threadId, bucket)
  }

  const index = { all, byId, byThread }
  turnIndexCache.set(records, index)
  return index
}

function indexMessages(records: Message[]): MessageIndex {
  const cached = messageIndexCache.get(records)
  if (cached) return cached

  const byId = new Map<string, Message>()
  for (const record of records) {
    if (!record.id || !record.threadId) continue
    const existing = byId.get(record.id)
    byId.set(record.id, existing ? { ...existing, ...record } : record)
  }

  const visible = [...byId.values()].filter((message) => !message.deletedAt)
  const byThread = new Map<string, Message[]>()
  for (const message of visible) {
    const bucket = byThread.get(message.threadId) ?? []
    bucket.push(message)
    byThread.set(message.threadId, bucket)
  }

  const index = { visible, byThread }
  messageIndexCache.set(records, index)
  return index
}

function getTurnPathIds(turns: Turn[], leafTurnId: string): string[] | null {
  const byId = new Map(turns.map((turn) => [turn.id, turn]))
  const pathIds: string[] = []
  const seen = new Set<string>()
  let cursor: string | undefined = leafTurnId

  while (cursor) {
    if (seen.has(cursor)) return null
    seen.add(cursor)
    const turn = byId.get(cursor)
    if (!turn) return null
    pathIds.unshift(turn.id)
    cursor = turn.parentTurnId
  }

  return pathIds
}

function messageRoleOrder(role: Message["role"]): number {
  if (role === "user") return 0
  if (role === "assistant") return 1
  return 2
}

export async function listThreads(bookId: string, options: { includeDeleted?: boolean } = {}): Promise<Thread[]> {
  try {
    const raw = await fs.readFile(filePath(bookId, THREADS_FILE), "utf-8")
    const data = JSON.parse(raw)
    const threads = Array.isArray(data) ? data.map((thread) => normalizeThread(bookId, thread)) : []
    return options.includeDeleted ? threads : threads.filter((thread) => thread.status !== "deleted")
  } catch {
    return []
  }
}

async function listAllThreads(bookId: string): Promise<Thread[]> {
  return listThreads(bookId, { includeDeleted: true })
}

export async function ensureDefaultThread(bookId: string): Promise<Thread> {
  const threads = await listAllThreads(bookId)
  const existingActive = threads
    .filter((thread) => thread.status === "active")
    .sort(compareThreadsByRecency)[0]
  if (existingActive) return existingActive

  return createThread(bookId, { title: "默认任务线程" })
}

function compareThreadsByRecency(a: Thread, b: Thread): number {
  const byUpdatedAt = timestampValue(b.updatedAt || b.createdAt) - timestampValue(a.updatedAt || a.createdAt)
  if (byUpdatedAt !== 0) return byUpdatedAt
  return b.createdAt.localeCompare(a.createdAt)
}

function timestampValue(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}

export async function getThread(bookId: string, threadId: string): Promise<Thread | null> {
  const threads = await listAllThreads(bookId)
  return threads.find((thread) => thread.id === threadId) ?? null
}

export async function createThread(bookId: string, args: {
  title?: string
  branchFrom?: Thread["branchFrom"]
} = {}): Promise<Thread> {
  const threads = await listAllThreads(bookId)
  const ts = nowIso()
  const thread: Thread = {
    id: makeId("thread"),
    bookId,
    title: args.title?.trim() || "新任务线程",
    status: "active",
    branchFrom: args.branchFrom,
    createdAt: ts,
    updatedAt: ts,
  }
  await saveThreads(bookId, [...threads, thread])
  return thread
}

export async function updateThread(bookId: string, threadId: string, patch: {
  title?: string
  status?: Thread["status"]
}): Promise<Thread | null> {
  const threads = await listAllThreads(bookId)
  let updatedThread: Thread | null = null
  const ts = nowIso()
  const updated = threads.map((thread) => {
    if (thread.id !== threadId) return thread
    updatedThread = {
      ...thread,
      title: typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : thread.title,
      status: patch.status ?? thread.status,
      archivedAt: patch.status === "archived" ? ts : patch.status === "active" ? undefined : thread.archivedAt,
      deletedAt: patch.status === "deleted" ? ts : thread.deletedAt,
      updatedAt: ts,
    }
    return updatedThread
  })
  await saveThreads(bookId, updated)
  return updatedThread
}

export async function touchThread(bookId: string, threadId: string): Promise<Thread> {
  const threads = await listAllThreads(bookId)
  const ts = nowIso()
  let touched: Thread | null = null
  const updated = threads.map((thread) => {
    if (thread.id !== threadId) return thread
    touched = { ...thread, updatedAt: ts }
    return touched
  })
  await saveThreads(bookId, updated)
  return touched ?? ensureDefaultThread(bookId)
}

export async function listTurns(bookId: string, threadId?: string): Promise<Turn[]> {
  const index = indexTurns(await readJsonl<Turn>(bookId, TURNS_FILE))
  return threadId ? [...(index.byThread.get(threadId) ?? [])] : [...index.all]
}

export async function listThreadMessages(bookId: string, threadId?: string): Promise<Message[]> {
  const index = indexMessages(await readJsonl<Message>(bookId, MESSAGES_FILE))
  return threadId ? [...(index.byThread.get(threadId) ?? [])] : [...index.visible]
}

export async function listThreadMessagesForTurnPath(
  bookId: string,
  threadId: string,
  leafTurnId: string | null,
): Promise<Message[]> {
  if (leafTurnId === null) return []

  const [turns, messages] = await Promise.all([
    listTurns(bookId, threadId),
    listThreadMessages(bookId, threadId),
  ])
  const pathTurnIds = getTurnPathIds(turns, leafTurnId)
  if (!pathTurnIds) return []

  const pathOrder = new Map(pathTurnIds.map((turnId, index) => [turnId, index]))
  return messages
    .filter((message) => pathOrder.has(message.turnId))
    .sort((a, b) => {
      const byTurn = (pathOrder.get(a.turnId) ?? 0) - (pathOrder.get(b.turnId) ?? 0)
      if (byTurn !== 0) return byTurn
      const byRole = messageRoleOrder(a.role) - messageRoleOrder(b.role)
      if (byRole !== 0) return byRole
      return a.createdAt.localeCompare(b.createdAt)
    })
}

export async function getThreadBundle(bookId: string, threadId: string): Promise<{
  thread: Thread
  turns: Turn[]
  messages: Message[]
} | null> {
  const thread = await getThread(bookId, threadId)
  if (!thread || thread.status === "deleted") return null
  const [turns, messages] = await Promise.all([
    listTurns(bookId, thread.id),
    listThreadMessages(bookId, thread.id),
  ])
  return { thread, turns, messages }
}

export async function appendThreadMessages(bookId: string, messages: Message[]): Promise<void> {
  await appendJsonl(bookId, MESSAGES_FILE, messages)
}

function resolveParentTurn(turns: Turn[], parentTurnId?: string | null): Turn | undefined {
  if (parentTurnId === undefined) {
    return [...turns].reverse().find((turn) => turn.status !== "cancelled")
  }
  if (parentTurnId === null) return undefined

  const parentTurn = turns.find((turn) => turn.id === parentTurnId)
  if (!parentTurn) {
    throw new Error("parentTurnId does not exist in the target thread")
  }
  return parentTurn
}

export async function createRunningTurn(
  bookId: string,
  threadId: string,
  content: string,
  references: Message["references"] = [],
  constraints: Message["constraints"] = [],
  options: { parentTurnId?: string | null } = {},
): Promise<{
  thread: Thread
  turn: Turn
  userMessage: Message
  baseAgentSessionId: string
}> {
  const thread = await touchThread(bookId, threadId)
  if (thread.status !== "active") {
    throw new Error("当前线程不可发送消息")
  }

  const turns = await listTurns(bookId, threadId)
  const parentTurn = resolveParentTurn(turns, options.parentTurnId)
  const ts = nowIso()
  const turnId = makeId("turn")
  const userMessageId = makeId("msg")
  const assistantMessageId = makeId("msg")
  const turn: Turn = {
    id: turnId,
    threadId: thread.id,
    parentTurnId: parentTurn?.id,
    userMessageId,
    agentSessionId: turnId,
    assistantMessageId,
    status: "running",
    createdAt: ts,
    updatedAt: ts,
  }
  const userMessage: Message = {
    id: userMessageId,
    threadId: thread.id,
    turnId,
    role: "user",
    content,
    version: 1,
    createdAt: ts,
    references: references.length > 0 ? references : undefined,
    constraints: constraints.length > 0 ? constraints : undefined,
  }

  await appendJsonl(bookId, TURNS_FILE, [turn])
  await appendThreadMessages(bookId, [userMessage])
  return {
    thread,
    turn,
    userMessage,
    baseAgentSessionId: parentTurn?.agentSessionId ?? (options.parentTurnId === undefined ? thread.id : turnId),
  }
}

export async function updateTurn(bookId: string, turnId: string, patch: Partial<Turn>): Promise<Turn | null> {
  const index = indexTurns(await readJsonl<Turn>(bookId, TURNS_FILE))
  const existing = index.byId.get(turnId)
  if (!existing) return null
  const updatedTurn: Turn = {
    ...existing,
    ...patch,
    id: existing.id,
    threadId: existing.threadId,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  }
  await appendJsonl(bookId, TURNS_FILE, [updatedTurn])
  return updatedTurn
}

export async function forkThread(bookId: string, sourceThreadId: string, turnId: string, title?: string): Promise<{
  thread: Thread
  turns: Turn[]
  messages: Message[]
}> {
  const source = await getThread(bookId, sourceThreadId)
  if (!source || source.status === "deleted") {
    throw new Error("源线程不存在")
  }

  const [sourceTurns, sourceMessages] = await Promise.all([
    listTurns(bookId, sourceThreadId),
    listThreadMessages(bookId, sourceThreadId),
  ])
  const pivotIndex = sourceTurns.findIndex((turn) => turn.id === turnId)
  if (pivotIndex < 0) {
    throw new Error("分叉位置不存在")
  }

  const copiedTurns = sourceTurns.slice(0, pivotIndex + 1)
  const thread = await createThread(bookId, {
    title: title?.trim() || `Branch: ${source.title}`,
    branchFrom: { threadId: sourceThreadId, turnId },
  })
  const ts = nowIso()
  const turnIdMap = new Map(copiedTurns.map((turn) => [turn.id, makeId("turn")]))
  const messageIdMap = new Map<string, string>()
  const copiedTurnIds = new Set(copiedTurns.map((turn) => turn.id))

  const sourceMessagesToCopy = sourceMessages.filter((message) => copiedTurnIds.has(message.turnId))
  for (const message of sourceMessagesToCopy) {
    messageIdMap.set(message.id, makeId("msg"))
  }

  const turns = copiedTurns.map((turn) => {
    const nextTurnId = turnIdMap.get(turn.id)!
    return {
      ...turn,
      id: nextTurnId,
      threadId: thread.id,
      parentTurnId: turn.parentTurnId ? turnIdMap.get(turn.parentTurnId) : undefined,
      userMessageId: messageIdMap.get(turn.userMessageId) ?? turn.userMessageId,
      assistantMessageId: turn.assistantMessageId ? messageIdMap.get(turn.assistantMessageId) : undefined,
      updatedAt: ts,
    }
  })
  const messages = sourceMessagesToCopy.map((message) => ({
    ...message,
    id: messageIdMap.get(message.id)!,
    threadId: thread.id,
    turnId: turnIdMap.get(message.turnId)!,
    events: message.events?.map((event) => ({
      ...event,
      id: makeId("event"),
      turnId: turnIdMap.get(event.turnId) ?? turnIdMap.get(message.turnId)!,
    })),
  }))
  await appendJsonl(bookId, TURNS_FILE, turns)
  await appendThreadMessages(bookId, messages)

  return { thread, turns, messages }
}

export function createAssistantMessage(args: {
  id?: string
  threadId: string
  turnId: string
  content: string
  brief?: Message["brief"]
  events?: AgentEvent[]
  changeSet?: Message["changeSet"]
  proposalSet?: Message["proposalSet"]
}): Message {
  return {
    id: args.id ?? makeId("msg"),
    threadId: args.threadId,
    turnId: args.turnId,
    role: "assistant",
    content: args.content,
    version: 1,
    createdAt: nowIso(),
    brief: args.brief,
    events: args.events,
    changeSet: args.changeSet,
    proposalSet: args.proposalSet,
  }
}

export function createAgentEvent(
  turnId: string,
  event: Omit<AgentEvent, "id" | "turnId" | "createdAt">,
): AgentEvent {
  return {
    id: makeId("event"),
    turnId,
    createdAt: nowIso(),
    ...event,
  }
}
