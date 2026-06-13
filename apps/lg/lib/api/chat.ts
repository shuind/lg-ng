import type { ChatReference, Message, SettingCard, Thread, Turn } from "../types"
import type { ResponseConstraint, WorkflowAction } from "../types"
import { normalizeResponseConstraintStore, readJsonResponse, type ResponseConstraintStorePayload } from "./common"

export type SendMessageOptions = {
  constraintIds?: string[]
  temporaryConstraints?: string[]
  skillIds?: string[]
  parentTurnId?: string | null
  readonlyOnly?: boolean
  workflowAction?: WorkflowAction
}

export type SendMessageStreamHandlers = {
  signal?: AbortSignal
  onTurn?: (payload: { thread: Thread; turn: Turn; userMessage: Message }) => void
  onAgentEvent?: (event: NonNullable<Message["events"]>[number]) => void
  onAssistantDelta?: (payload: { text: string }) => void
  onReasoningDelta?: (payload: { text: string; loop?: number }) => void
  onAssistantMessage?: (message: Message) => void
  onDone?: (payload: {
    thread: Thread
    turn: Turn
    userMessage: Message
    assistantMessage?: Message
    events: NonNullable<Message["events"]>
    cancelled?: boolean
  }) => void
  onError?: (payload: { message?: string }) => void
}

export async function listMessages(bookId: string): Promise<Message[]> {
  const res = await fetch(`/api/books/${bookId}/messages`, { cache: "no-store" })
  const data = await readJsonResponse<Message[]>(res)
  if (!Array.isArray(data)) throw new Error("消息列表返回格式无效")
  return data
}

export async function sendMessage(
  bookId: string,
  content: string,
  threadId?: string,
  references: ChatReference[] = [],
  options: SendMessageOptions = {},
): Promise<{
  thread: Thread
  turn: Turn
  userMessage: Message
  assistantMessage?: Message
  events: NonNullable<Message["events"]>
}> {
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
      parentTurnId: options.parentTurnId,
      readonlyOnly: options.readonlyOnly,
      workflowAction: options.workflowAction,
    }),
  })
  const data = await readJsonResponse<{
    thread: Thread
    turn: Turn
    userMessage: Message
    assistantMessage?: Message
    events?: NonNullable<Message["events"]>
  }>(res)
  return {
    thread: data.thread,
    turn: data.turn,
    userMessage: data.userMessage,
    assistantMessage: data.assistantMessage,
    events: Array.isArray(data.events) ? data.events : [],
  }
}

export async function sendMessageStream(
  bookId: string,
  content: string,
  threadId?: string,
  references: ChatReference[] = [],
  options: SendMessageOptions = {},
  handlers: SendMessageStreamHandlers = {},
): Promise<void> {
  const res = await fetch(`/api/books/${bookId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: handlers.signal,
    body: JSON.stringify({
      content,
      threadId,
      references,
      constraintIds: options.constraintIds,
      temporaryConstraints: options.temporaryConstraints,
      skillIds: options.skillIds,
      parentTurnId: options.parentTurnId,
      readonlyOnly: options.readonlyOnly,
      workflowAction: options.workflowAction,
    }),
  })
  if (!res.ok) {
    await readJsonResponse(res)
  }
  if (!res.body) throw new Error("流式响应不可用")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\n\n/)
    buffer = parts.pop() ?? ""
    for (const part of parts) {
      dispatchSseEvent(part, handlers)
    }
  }
  if (buffer.trim()) dispatchSseEvent(buffer, handlers)
}

export async function runBookReview(
  bookId: string,
  threadId: string,
  options: { kind?: "continuity"; scope?: string } = {},
): Promise<{
  thread: Thread
  turn: Turn
  userMessage: Message
  assistantMessage?: Message
  events: NonNullable<Message["events"]>
}> {
  const res = await fetch(`/api/books/${bookId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId,
      kind: options.kind ?? "continuity",
      scope: options.scope,
    }),
  })
  const data = await readJsonResponse<{
    thread: Thread
    turn: Turn
    userMessage: Message
    assistantMessage?: Message
    events?: NonNullable<Message["events"]>
  }>(res)
  return {
    thread: data.thread,
    turn: data.turn,
    userMessage: data.userMessage,
    assistantMessage: data.assistantMessage,
    events: Array.isArray(data.events) ? data.events : [],
  }
}

function dispatchSseEvent(raw: string, handlers: SendMessageStreamHandlers): void {
  const lines = raw.split(/\r?\n/)
  const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim()
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
  if (!event || dataLines.length === 0) return

  const payload = JSON.parse(dataLines.join("\n"))
  switch (event) {
    case "turn":
      handlers.onTurn?.(payload)
      break
    case "agent_event":
      handlers.onAgentEvent?.(payload)
      break
    case "assistant_delta":
      handlers.onAssistantDelta?.(payload)
      break
    case "reasoning_delta":
      handlers.onReasoningDelta?.(payload)
      break
    case "assistant_message":
      handlers.onAssistantMessage?.(payload)
      break
    case "done":
      handlers.onDone?.(payload)
      break
    case "error":
      handlers.onError?.(payload)
      break
  }
}

export async function listSettingCards(bookId: string): Promise<SettingCard[]> {
  const res = await fetch(`/api/books/${bookId}/setting-cards`, { cache: "no-store" })
  const data = await readJsonResponse<SettingCard[]>(res)
  if (!Array.isArray(data)) throw new Error("设定卡返回格式无效")
  return data
}

export async function listResponseConstraints(bookId: string): Promise<ResponseConstraintStorePayload> {
  const res = await fetch(`/api/books/${bookId}/response-constraints`, { cache: "no-store" })
  return normalizeResponseConstraintStore(await readJsonResponse(res))
}

export async function createResponseConstraint(
  bookId: string,
  input: Pick<ResponseConstraint, "title" | "instruction">,
): Promise<ResponseConstraintStorePayload> {
  const res = await fetch(`/api/books/${bookId}/response-constraints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return normalizeResponseConstraintStore(await readJsonResponse(res))
}

export async function updateResponseConstraint(
  bookId: string,
  input: Pick<ResponseConstraint, "id" | "title" | "instruction">,
): Promise<ResponseConstraintStorePayload> {
  const res = await fetch(`/api/books/${bookId}/response-constraints`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return normalizeResponseConstraintStore(await readJsonResponse(res))
}

export async function deleteResponseConstraint(
  bookId: string,
  constraintId: string,
): Promise<ResponseConstraintStorePayload> {
  const res = await fetch(`/api/books/${bookId}/response-constraints?id=${encodeURIComponent(constraintId)}`, {
    method: "DELETE",
  })
  return normalizeResponseConstraintStore(await readJsonResponse(res))
}

export async function setThreadResponseConstraints(
  bookId: string,
  threadId: string,
  enabledIds: string[],
): Promise<ResponseConstraintStorePayload> {
  const res = await fetch(`/api/books/${bookId}/response-constraints`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, enabledIds }),
  })
  return normalizeResponseConstraintStore(await readJsonResponse(res))
}
