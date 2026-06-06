import fs from "fs/promises"
import path from "path"
import type { AgentEvent, Message, Thread, Turn } from "@/lib/types"
import { getBookDir } from "@/lib/server/paths"

const THREADS_FILE = "threads.json"
const TURNS_FILE = "turns.jsonl"
const MESSAGES_FILE = "thread-messages.jsonl"

function filePath(bookId: string, fileName: string): string {
  return path.join(getBookDir(bookId), fileName)
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
  try {
    const raw = await fs.readFile(filePath(bookId, fileName), "utf-8")
    const items: T[] = []
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue
      try {
        items.push(JSON.parse(line) as T)
      } catch {
        // Ignore corrupt lines so one bad append does not hide the thread.
      }
    }
    return items
  } catch {
    return []
  }
}

async function appendJsonl<T>(bookId: string, fileName: string, items: T[]): Promise<void> {
  if (items.length === 0) return
  const target = filePath(bookId, fileName)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.appendFile(target, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf-8")
}

async function writeJsonl<T>(bookId: string, fileName: string, items: T[]): Promise<void> {
  const target = filePath(bookId, fileName)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const body = items.length > 0 ? `${items.map((item) => JSON.stringify(item)).join("\n")}\n` : ""
  await fs.writeFile(target, body, "utf-8")
}

async function saveThreads(bookId: string, threads: Thread[]): Promise<void> {
  const target = filePath(bookId, THREADS_FILE)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(threads, null, 2), "utf-8")
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
  const existingActive = threads.find((thread) => thread.status === "active")
  if (existingActive) return existingActive

  return createThread(bookId, { title: "默认任务线程" })
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
  const turns = await readJsonl<Turn>(bookId, TURNS_FILE)
  return threadId ? turns.filter((turn) => turn.threadId === threadId) : turns
}

export async function listThreadMessages(bookId: string, threadId?: string): Promise<Message[]> {
  const messages = await readJsonl<Message>(bookId, MESSAGES_FILE)
  const visible = messages.filter((message) => !message.deletedAt)
  return threadId ? visible.filter((message) => message.threadId === threadId) : visible
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

export async function createRunningTurn(
  bookId: string,
  threadId: string,
  content: string,
  references: Message["references"] = [],
  constraints: Message["constraints"] = [],
): Promise<{
  thread: Thread
  turn: Turn
  userMessage: Message
}> {
  const thread = await touchThread(bookId, threadId)
  if (thread.status !== "active") {
    throw new Error("当前线程不可发送消息")
  }

  const turns = await listTurns(bookId, threadId)
  const parentTurn = [...turns].reverse().find((turn) => turn.status !== "cancelled")
  const ts = nowIso()
  const turnId = makeId("turn")
  const userMessageId = makeId("msg")
  const turn: Turn = {
    id: turnId,
    threadId: thread.id,
    parentTurnId: parentTurn?.id,
    userMessageId,
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
  return { thread, turn, userMessage }
}

export async function updateTurn(bookId: string, turnId: string, patch: Partial<Turn>): Promise<Turn | null> {
  const turns = await listTurns(bookId)
  let updatedTurn: Turn | null = null
  const updated = turns.map((turn) => {
    if (turn.id !== turnId) return turn
    updatedTurn = { ...turn, ...patch, updatedAt: nowIso() }
    return updatedTurn
  })
  await writeJsonl(bookId, TURNS_FILE, updated)
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

  const copiedTurns = sourceTurns.slice(0, pivotIndex)
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
  threadId: string
  turnId: string
  content: string
  brief?: Message["brief"]
  events?: AgentEvent[]
}): Message {
  return {
    id: makeId("msg"),
    threadId: args.threadId,
    turnId: args.turnId,
    role: "assistant",
    content: args.content,
    version: 1,
    createdAt: nowIso(),
    brief: args.brief,
    events: args.events,
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
