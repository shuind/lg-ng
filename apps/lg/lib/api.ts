// 后端接口层 - 优先调用真实 API,失败时回退 mock
import {
  type Book,
  type Chapter,
  type OutlineFile,
  type Message,
  type SettingCard,
  type Thread,
  type Turn,
  type WorkbenchGroup,
  type WorkbenchFile,
  mockBooks,
  mockChapters,
  mockMessages,
  mockThreads,
  mockTurns,
  mockSettingCards,
  mockWorkbenchTree,
  mockFileContent,
} from "./mock-data"
import type {
  BookTreeNode,
  CreateSkillRequest,
  LedgerEntry,
  RelationshipGraph,
  ResponseConstraint,
  RetrievedContext,
  Skill,
  SkillDraftRequest,
  SkillDraftResponse,
  UpdateSkillRequest,
} from "./types"

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

export type ThreadBundle = {
  thread: Thread
  turns: Turn[]
  messages: Message[]
}

export type ResponseConstraintStorePayload = {
  constraints: ResponseConstraint[]
  threadEnabled: Record<string, string[]>
  updatedAt: string
}

export type SendMessageOptions = {
  constraintIds?: string[]
  temporaryConstraints?: string[]
  skillIds?: string[]
}

const fallbackResponseConstraints: ResponseConstraint[] = [
  {
    id: "default-no-unsolicited-advice",
    title: "不主动追加写作建议",
    instruction: "除非用户明确要求，不要在回复末尾主动追加写作建议、下一步建议或可选方案。",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "default-natural-restraint",
    title: "自然克制语气",
    instruction: "保持自然、克制、贴近对话的语气，不夸张、不卖弄、不使用过度热情的套话。",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "default-no-fixed-ending-question",
    title: "不用固定结尾问句",
    instruction: "不要用固定模板式结尾问句收尾，例如“要不要我继续……”。需要收束时直接收束。",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

function normalizeResponseConstraintStore(data: unknown): ResponseConstraintStorePayload {
  const raw = data && typeof data === "object" ? data as Partial<ResponseConstraintStorePayload> : {}
  return {
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    threadEnabled: raw.threadEnabled && typeof raw.threadEnabled === "object" ? raw.threadEnabled : {},
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  }
}

function relativeTime(iso: string): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "昨日"
  return `${days}d`
}

// === 书籍 ===
export async function listBooks(): Promise<Book[]> {
  try {
    const res = await fetch("/api/books", { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty")
    return data.map((b: { id: string; title: string; updatedAt: string }) => ({
      id: b.id,
      title: b.title,
      updatedAt: relativeTime(b.updatedAt),
    }))
  } catch {
    await delay()
    return mockBooks
  }
}

export async function createBook(title?: string): Promise<Book> {
  try {
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title ?? "未命名书籍" }),
    })
    if (!res.ok) throw new Error("api failed")
    const b = await res.json()
    return { id: b.id, title: b.title, updatedAt: "刚刚" }
  } catch {
    await delay()
    return { id: `b${Date.now()}`, title: title ?? "未命名", updatedAt: "刚刚" }
  }
}

export async function renameBook(bookId: string, title: string): Promise<Book | null> {
  try {
    const res = await fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    const b = await res.json()
    return { id: b.id, title: b.title, updatedAt: relativeTime(b.updatedAt) }
  } catch {
    return null
  }
}

// === 初始化(合并请求) ===
export async function initBook(bookId: string): Promise<{
  chapters: Chapter[]
  outlines: OutlineFile[]
  messages: Message[]
  threads: Thread[]
  activeThreadId: string
  turns: Turn[]
  cards: SettingCard[]
  responseConstraints: ResponseConstraint[]
  threadConstraintIds: Record<string, string[]>
}> {
  try {
    const res = await fetch(`/api/books/${bookId}/init`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    const threads = Array.isArray(data.threads) ? data.threads : []
    const activeThreadId = typeof data.activeThreadId === "string" ? data.activeThreadId : threads[0]?.id ?? ""
    return {
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      outlines: Array.isArray(data.outlines) ? data.outlines : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      threads,
      activeThreadId,
      turns: Array.isArray(data.turns) ? data.turns : [],
      cards: Array.isArray(data.cards) ? data.cards : [],
      responseConstraints: Array.isArray(data.responseConstraints) ? data.responseConstraints : [],
      threadConstraintIds: data.threadConstraintIds && typeof data.threadConstraintIds === "object" ? data.threadConstraintIds : {},
    }
  } catch {
    await delay()
    const threads = mockThreads.filter((t) => t.bookId === bookId || bookId === "b1")
    return {
      chapters: mockChapters.filter((c) => c.bookId === bookId),
      outlines: [],
      messages: mockMessages,
      threads,
      activeThreadId: threads[0]?.id ?? "thread-mock",
      turns: mockTurns,
      cards: mockSettingCards,
      responseConstraints: fallbackResponseConstraints,
      threadConstraintIds: {},
    }
  }
}

// === 章节 ===
export async function listChapters(bookId: string): Promise<Chapter[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockChapters.filter((c) => c.bookId === bookId)
  }
}

export async function createChapter(bookId: string, title?: string): Promise<Chapter> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    const idx =
      mockChapters.filter((c) => c.bookId === bookId).reduce((m, c) => Math.max(m, c.index), 0) + 1
    return {
      id: `c${Date.now()}`,
      bookId,
      title: title ?? `第${idx}章 · 未命名`,
      index: idx,
      wordCount: 0,
      status: "draft",
      path: `章节正文/${title ?? `第${idx}章 · 未命名`}.md`,
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function getChapter(bookId: string, chapterId: string): Promise<{ id: string; title: string; content: string; updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return {
      id: chapterId,
      title: mockChapters.find((c) => c.id === chapterId)?.title ?? "",
      content: "",
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function saveChapter(bookId: string, chapterId: string, content: string): Promise<{ updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    console.log("[mock] saveChapter", chapterId, content.length)
    return { updatedAt: new Date().toISOString() }
  }
}

// === 对话 ===
export async function listMessages(bookId: string): Promise<Message[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/messages`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockMessages
  }
}

export async function sendMessage(
  bookId: string,
  content: string,
  threadId?: string,
  references: SettingCard[] = [],
  options: SendMessageOptions = {},
): Promise<{
  thread: Thread
  turn: Turn
  userMessage: Message
  assistantMessage?: Message
  events: NonNullable<Message["events"]>
}> {
  try {
    const res = await fetch(`/api/books/${bookId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        threadId,
        references,
        constraintIds: options.constraintIds,
        temporaryConstraints: options.temporaryConstraints,
        skillIds: options.skillIds,
      }),
    })
    const data = await res.json()
    const payload = {
      thread: data.thread,
      turn: data.turn,
      userMessage: data.userMessage,
      assistantMessage: data.assistantMessage,
      events: Array.isArray(data.events) ? data.events : [],
    }
    if (!res.ok && payload.turn && payload.userMessage) return payload
    if (!res.ok) throw new Error(data?.error ?? "api failed")
    return payload
  } catch {
    await delay(400)
    const ts = new Date().toISOString()
    const fallbackThread: Thread = mockThreads[0] ?? {
      id: threadId ?? `thread-${Date.now()}`,
      bookId,
      title: "默认任务线程",
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    }
    const turn: Turn = {
      id: `turn-${Date.now()}`,
      threadId: fallbackThread.id,
      userMessageId: `u${Date.now()}`,
      assistantMessageId: `m${Date.now()}`,
      status: "done",
      createdAt: ts,
      updatedAt: ts,
    }
    const userMessage: Message = {
      id: turn.userMessageId,
      threadId: fallbackThread.id,
      turnId: turn.id,
      role: "user",
      content,
      version: 1,
      createdAt: ts,
      references: references.map((card) => ({
        type: card.category,
        name: card.name,
        path: card.path ?? card.id,
      })),
      constraints: options.temporaryConstraints?.map((instruction, index) => ({
        title: `本轮临时约束 ${index + 1}`,
        instruction,
        source: "temporary" as const,
      })),
    }
    const events: NonNullable<Message["events"]> = [
      {
        id: `event-${Date.now()}`,
        turnId: turn.id,
        type: "done",
        text: "离线 mock 已返回。",
        createdAt: ts,
      },
    ]
    const assistantMessage: Message = {
      id: turn.assistantMessageId!,
      threadId: fallbackThread.id,
      turnId: turn.id,
      role: "assistant",
      content: "已收到。离线模式下不会写入项目文件；真实服务可直接协作写入，并在 Ledger 里记录改动。",
      version: 1,
      createdAt: ts,
      events,
    }
    return {
      thread: fallbackThread,
      turn,
      userMessage,
      assistantMessage,
      events,
    }
  }
}

export async function createThread(bookId: string, title?: string): Promise<ThreadBundle> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    const ts = new Date().toISOString()
    return {
      thread: {
        id: `thread-${Date.now()}`,
        bookId,
        title: title?.trim() || "新任务线程",
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      },
      turns: [],
      messages: [],
    }
  }
}

export async function forkThread(
  bookId: string,
  forkFrom: { threadId: string; turnId: string },
  title?: string,
): Promise<ThreadBundle> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, forkFrom }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    const ts = new Date().toISOString()
    return {
      thread: {
        id: `thread-${Date.now()}`,
        bookId,
        title: title?.trim() || "Branch",
        status: "active",
        branchFrom: forkFrom,
        createdAt: ts,
        updatedAt: ts,
      },
      turns: [],
      messages: [],
    }
  }
}

export async function getThread(bookId: string, threadId: string): Promise<ThreadBundle | null> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads/${encodeURIComponent(threadId)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return null
  }
}

export async function updateThread(
  bookId: string,
  threadId: string,
  patch: { title?: string; status?: Thread["status"] },
): Promise<Thread | null> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads/${encodeURIComponent(threadId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return data.thread ?? null
  } catch {
    await delay()
    return null
  }
}

// === 设定卡片 ===
export async function listSettingCards(bookId: string): Promise<SettingCard[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/setting-cards`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockSettingCards
  }
}

// === 试写沙盒 ===
// === 回复约束 ===
export async function listResponseConstraints(bookId: string): Promise<ResponseConstraintStorePayload> {
  try {
    const res = await fetch(`/api/books/${bookId}/response-constraints`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return normalizeResponseConstraintStore(await res.json())
  } catch {
    await delay()
    return {
      constraints: fallbackResponseConstraints,
      threadEnabled: {},
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function createResponseConstraint(
  bookId: string,
  input: Pick<ResponseConstraint, "title" | "instruction">,
): Promise<ResponseConstraintStorePayload> {
  try {
    const res = await fetch(`/api/books/${bookId}/response-constraints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error("api failed")
    return normalizeResponseConstraintStore(await res.json())
  } catch {
    await delay()
    const ts = new Date().toISOString()
    return {
      constraints: [
        ...fallbackResponseConstraints,
        {
          id: `constraint-${Date.now()}`,
          title: input.title,
          instruction: input.instruction,
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      threadEnabled: {},
      updatedAt: ts,
    }
  }
}

export async function updateResponseConstraint(
  bookId: string,
  input: Pick<ResponseConstraint, "id" | "title" | "instruction">,
): Promise<ResponseConstraintStorePayload> {
  try {
    const res = await fetch(`/api/books/${bookId}/response-constraints`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error("api failed")
    return normalizeResponseConstraintStore(await res.json())
  } catch {
    await delay()
    const ts = new Date().toISOString()
    return {
      constraints: fallbackResponseConstraints.map((constraint) =>
        constraint.id === input.id ? { ...constraint, ...input, updatedAt: ts } : constraint,
      ),
      threadEnabled: {},
      updatedAt: ts,
    }
  }
}

export async function deleteResponseConstraint(
  bookId: string,
  constraintId: string,
): Promise<ResponseConstraintStorePayload> {
  try {
    const res = await fetch(`/api/books/${bookId}/response-constraints?id=${encodeURIComponent(constraintId)}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error("api failed")
    return normalizeResponseConstraintStore(await res.json())
  } catch {
    await delay()
    const ts = new Date().toISOString()
    return {
      constraints: fallbackResponseConstraints.filter((constraint) => constraint.id !== constraintId),
      threadEnabled: {},
      updatedAt: ts,
    }
  }
}

export async function setThreadResponseConstraints(
  bookId: string,
  threadId: string,
  enabledIds: string[],
): Promise<ResponseConstraintStorePayload> {
  try {
    const res = await fetch(`/api/books/${bookId}/response-constraints`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, enabledIds }),
    })
    if (!res.ok) throw new Error("api failed")
    return normalizeResponseConstraintStore(await res.json())
  } catch {
    await delay()
    return {
      constraints: fallbackResponseConstraints,
      threadEnabled: { [threadId]: enabledIds },
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function generateDraft(bookId: string, chapterId: string, prompt?: string): Promise<string> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return data.draft ?? "（试写）生成失败，请重试。"
  } catch {
    await delay(600)
    return "（试写）夜色压得人心头发沉。林晓提着剑,沿着回廊往内堂走去,廊下的灯一盏一盏地灭。"
  }
}

// === 工作台 ===
const workbenchGroupOrder = [
  "章节正文",
  "卷纲",
  "章节大纲",
  "章节摘要",
  "人物设定",
  "世界观",
  "剧情管理",
  "状态追踪",
  "读者体验",
  "写作约束",
  "检查报告",
  "定稿设定",
  "候选素材",
  "归档资料",
  "草稿箱",
  "收件箱",
  "项目文件",
  "其他",
  "系统文件",
]

const workbenchGroupByRoot: Record<string, string> = {
  data: "项目文件",
  章节正文: "章节正文",
  chapters: "章节正文",
  章节大纲: "章节大纲",
  章纲: "章节大纲",
  outlines: "章节大纲",
  章节摘要: "章节摘要",
  summaries: "章节摘要",
  卷纲: "卷纲",
  人物设定: "人物设定",
  characters: "人物设定",
  世界观: "世界观",
  settings: "世界观",
  剧情管理: "剧情管理",
  plots: "剧情管理",
  状态追踪: "状态追踪",
  timeline: "状态追踪",
  读者体验: "读者体验",
  reader: "读者体验",
  写作约束: "写作约束",
  constraints: "写作约束",
  检查报告: "检查报告",
  reports: "检查报告",
  canon: "定稿设定",
  candidates: "候选素材",
  archive: "归档资料",
  drafts: "草稿箱",
  inbox: "收件箱",
}

const workbenchSegmentLabels: Record<string, string> = {
  characters: "人物",
  settings: "设定",
  foreshadowing: "伏笔",
  timeline: "时间线",
  plots: "剧情",
  glossary: "术语表",
}

const hiddenWorkbenchSegments = new Set([
  ".claude",
  ".novel-guide",
  ".next",
  ".turbo",
  "node_modules",
  "skills",
])

const hiddenWorkbenchFileNames = new Set([
  ".ds_store",
  ".gitkeep",
  "book.json",
  "ledger.jsonl",
  "messages.jsonl",
  "pending-action-plan.json",
  "proposals.jsonl",
  "response-constraints.json",
  "thread-messages.jsonl",
  "threads.json",
  "turns.jsonl",
])

const hiddenWorkbenchExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".mp3",
  ".wav",
  ".mp4",
  ".mov",
  ".zip",
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".sqlite",
  ".db",
])

const systemWorkbenchFileNames = new Set([
  "claude.md",
  "novel.md",
  "创作指南.md",
  "关系图谱.json",
])

const systemWorkbenchRoots = new Set([
  "data",
])

function splitWorkbenchPath(filePath: string): string[] {
  return filePath.replace(/\\/g, "/").split("/").filter(Boolean)
}

function isHiddenWorkbenchPath(filePath: string): boolean {
  const segments = splitWorkbenchPath(filePath)
  if (segments.length === 0) return true
  if (segments.some((segment) => segment.startsWith("."))) return true
  if (segments.some((segment) => hiddenWorkbenchSegments.has(segment))) return true

  const fileName = segments[segments.length - 1].toLowerCase()
  if (hiddenWorkbenchFileNames.has(fileName)) return true

  const dotIndex = fileName.lastIndexOf(".")
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : ""
  return hiddenWorkbenchExtensions.has(extension)
}

function humanizeWorkbenchSegment(segment: string): string {
  const dotIndex = segment.lastIndexOf(".")
  const base = dotIndex > 0 ? segment.slice(0, dotIndex) : segment
  const extension = dotIndex > 0 ? segment.slice(dotIndex) : ""
  const label = workbenchSegmentLabels[base.toLowerCase()]
  return label ? `${label}${extension}` : segment
}

function toWorkbenchCategory(filePath: string): { label: string; name: string } | null {
  if (isHiddenWorkbenchPath(filePath)) return null

  const segments = splitWorkbenchPath(filePath)
  if (segments.length === 1) {
    if (systemWorkbenchFileNames.has(segments[0].toLowerCase())) {
      return { label: "系统文件", name: humanizeWorkbenchSegment(segments[0]) }
    }
    return { label: "项目文件", name: humanizeWorkbenchSegment(segments[0]) }
  }

  const [root, ...rest] = segments
  if (
    systemWorkbenchRoots.has(root.toLowerCase()) &&
    rest.length > 0 &&
    systemWorkbenchFileNames.has(rest[rest.length - 1].toLowerCase())
  ) {
    return { label: "系统文件", name: rest.map(humanizeWorkbenchSegment).join("/") }
  }

  const label = workbenchGroupByRoot[root] ?? "其他"
  const displaySegments = label === "其他" ? segments : rest
  return {
    label,
    name: displaySegments.map(humanizeWorkbenchSegment).join("/"),
  }
}

function sortWorkbenchFiles(files: WorkbenchFile[]): WorkbenchFile[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
}

export async function listWorkbenchTree(bookId: string): Promise<WorkbenchGroup[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/tree`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const nodes: BookTreeNode[] = await res.json()
    if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("empty")

    const groups = new Map<string, WorkbenchGroup>()

    function appendFile(node: BookTreeNode) {
      const category = toWorkbenchCategory(node.path)
      if (!category) return

      const existing = groups.get(category.label)
      const group = existing ?? { id: `workbench:${category.label}`, label: category.label, files: [] }
      group.files.push({ id: node.path, name: category.name, path: node.path })
      groups.set(category.label, group)
    }

    function visit(nodes: BookTreeNode[]) {
      for (const node of nodes) {
        if (node.type === "file") {
          appendFile(node)
        } else {
          visit(node.children ?? [])
        }
      }
    }

    visit(nodes)

    return [...groups.values()]
      .map((group) => ({ ...group, files: sortWorkbenchFiles(group.files) }))
      .sort((a, b) => {
        const ai = workbenchGroupOrder.indexOf(a.label)
        const bi = workbenchGroupOrder.indexOf(b.label)
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        return a.label.localeCompare(b.label, "zh-CN", { numeric: true })
      })
  } catch {
    await delay()
    return mockWorkbenchTree
  }
}

export async function readWorkbenchFile(bookId: string, path: string): Promise<{ content: string; updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (typeof data.content === "string") return { content: data.content, updatedAt: data.updatedAt ?? "" }
    throw new Error("no content")
  } catch {
    await delay()
    return { content: mockFileContent[path] ?? `# ${path}\n\n（暂无内容）`, updatedAt: "" }
  }
}

export async function writeWorkbenchFile(bookId: string, path: string, content: string): Promise<{ updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return { updatedAt: data.updatedAt ?? new Date().toISOString() }
  } catch {
    await delay()
    console.log("[mock] writeWorkbenchFile", path, content.length)
    return { updatedAt: new Date().toISOString() }
  }
}

// === Ledger ===
export async function listLedgerEntries(bookId: string): Promise<LedgerEntry[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/ledger`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return []
  }
}

export async function rollbackLedgerEntry(bookId: string, entryId: string): Promise<{ updatedAt: string }> {
  const res = await fetch(`/api/books/${bookId}/ledger/${encodeURIComponent(entryId)}/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.error === "string" ? data.error : "回滚失败")
  }
  const data = await res.json()
  return { updatedAt: data.updatedAt ?? new Date().toISOString() }
}

// === Relationship Graph ===
export async function getRelationshipGraph(bookId: string): Promise<RelationshipGraph> {
  try {
    const res = await fetch(`/api/books/${bookId}/graph`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return { nodes: [], edges: [] }
  }
}

// === Retrieval ===
export async function retrieveContext(bookId: string, query: string): Promise<RetrievedContext[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return []
  }
}

// === Skills ===
function fallbackStyleGuideSkill(bookId: string): Skill {
  return {
    id: `skill-style-${bookId}`,
    type: "style_guide",
    scope: "book",
    bookId,
    sourceFile: "创作指南.md",
    summaryFile: "skills/style_guide_summary.md",
    summaryTokenCount: 0,
    lastSourceModified: "",
    lastSummaryGenerated: "",
    dirty: false,
  }
}

export async function listSkills(bookId: string): Promise<Skill[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return [fallbackStyleGuideSkill(bookId)]
  }
}

export async function draftSkill(bookId: string, input: SkillDraftRequest): Promise<SkillDraftResponse> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "接口请求失败")
    return {
      name: typeof data.name === "string" ? data.name : "novel-skill",
      skillMd: typeof data.skillMd === "string" ? data.skillMd : "",
      resources: Array.isArray(data.resources) ? data.resources : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    }
  } catch {
    await delay()
    return {
      name: "novel-skill",
      skillMd: [
        "---",
        "name: novel-skill",
        "description: \"当前书籍项目内可复用的小说写作流程。\"",
        "when_to_use: \"当用户明确需要这套写作流程时使用。\"",
        "argument-hint: \"[范围或参考材料]\"",
        "---",
        "",
        "# novel-skill",
        "",
        "这个 Skill 用来沉淀一套可复用的小说写作流程。",
        "",
        "## 工作流程",
        "",
        "1. 先确认用户这次想要的具体产出。",
        "2. 判断是否需要读取相关书籍文件，不要凭空断言。",
        "3. 结合项目设定、写作约束和必要参考资料处理。",
        "4. 输出结果时保持简洁，需要时给出相关文件路径。",
        "",
      ].join("\n"),
      resources: [],
      warnings: ["暂时无法连接草稿接口，已先生成本地模板。"],
    }
  }
}

export async function createSkill(bookId: string, input: CreateSkillRequest): Promise<Skill> {
  const res = await fetch(`/api/books/${bookId}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "创建 Skill 失败。")
  }
  if (data?.skill) return data.skill
  throw new Error("创建 Skill 成功但接口没有返回 Skill 信息。")
}

export async function getSkillDraft(bookId: string, skillName: string): Promise<SkillDraftResponse> {
  const res = await fetch(`/api/books/${bookId}/skills/${encodeURIComponent(skillName)}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "读取 Skill 失败。")
  }
  return {
    name: typeof data.name === "string" ? data.name : skillName,
    skillMd: typeof data.skillMd === "string" ? data.skillMd : "",
    resources: Array.isArray(data.resources) ? data.resources : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  }
}

export async function updateSkill(bookId: string, input: UpdateSkillRequest): Promise<Skill> {
  const res = await fetch(`/api/books/${bookId}/skills/${encodeURIComponent(input.originalName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "更新 Skill 失败。")
  }
  if (data?.skill) return data.skill
  throw new Error("更新 Skill 成功但接口没有返回 Skill 信息。")
}

export async function getStyleGuideSkill(bookId: string): Promise<{ skill: Skill; summary: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/style-guide`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return {
      skill: fallbackStyleGuideSkill(bookId),
      summary: "",
    }
  }
}

export async function refreshStyleGuideSummary(bookId: string): Promise<{ skill: Skill; summary: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/style-guide/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return {
      skill: fallbackStyleGuideSkill(bookId),
      summary: "",
    }
  }
}
