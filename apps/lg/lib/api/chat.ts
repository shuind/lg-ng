import { type Message, type SettingCard, type Thread, type Turn, mockMessages, mockSettingCards, mockThreads } from "../mock-data"
import type { ResponseConstraint, WorkflowAction } from "../types"
import { delay, fallbackResponseConstraints, normalizeResponseConstraintStore, type ResponseConstraintStorePayload } from "./common"

export type SendMessageOptions = {
  constraintIds?: string[]
  temporaryConstraints?: string[]
  skillIds?: string[]
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
        readonlyOnly: options.readonlyOnly,
        workflowAction: options.workflowAction,
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

export async function sendMessageStream(
  bookId: string,
  content: string,
  threadId?: string,
  references: SettingCard[] = [],
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
      readonlyOnly: options.readonlyOnly,
      workflowAction: options.workflowAction,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error ?? "api failed")
  }
  if (!res.body) throw new Error("stream unavailable")

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
  const data = await res.json()
  const payload = {
    thread: data.thread,
    turn: data.turn,
    userMessage: data.userMessage,
    assistantMessage: data.assistantMessage,
    events: Array.isArray(data.events) ? data.events : [],
  }
  if (!res.ok && payload.turn && payload.userMessage) return payload
  if (!res.ok) throw new Error(data?.error ?? "体检失败")
  return payload
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
