import path from "node:path"
import { touchBookUpdatedAt } from "@/lib/server/book-store"
import { markDirty } from "@/lib/server/dirty-index"
import { appendLedgerEntry } from "@/lib/server/ledger"
import { updateIndexedFile } from "@/lib/server/book-index"
import { withBookMutationQueue } from "@/lib/server/book-mutation-queue"
import { runNovelGuideAgent, runNovelGuideAgentStream } from "@/lib/server/novel-guide-agent"
import { getBookDir } from "@/lib/server/paths"
import { resolveResponseConstraintSnapshot } from "@/lib/server/response-constraint-store"
import { resolveSkillSummaries } from "@/lib/server/skill-service"
import {
  appendThreadMessages,
  createAgentEvent,
  createAssistantMessage,
  createRunningTurn,
  ensureDefaultThread,
  getThread,
  listThreadMessages,
  updateTurn,
} from "@/lib/server/thread-store"
import type { AppliedResponseConstraint, SettingCard } from "@/lib/types"
import type { FileChange } from "novel-guide"

type TrackedFileChange = FileChange & { path: string }
type SseController = ReadableStreamDefaultController<Uint8Array>

export class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const INTERNAL_CHANGE_FILES = new Set([
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

const INTERNAL_CHANGE_DIRS = new Set([".novel-guide", ".next", ".turbo", "node_modules"])

export async function getDefaultThreadMessages(bookId: string) {
  const thread = await ensureDefaultThread(bookId)
  return listThreadMessages(bookId, thread.id)
}

export async function sendThreadMessage(bookId: string, body: unknown): Promise<{
  status: number
  payload: unknown
}> {
  return withBookMutationQueue(bookId, () => sendThreadMessageUnlocked(bookId, body))
}

async function sendThreadMessageUnlocked(bookId: string, body: unknown): Promise<{
  status: number
  payload: unknown
}> {
  const input = normalizeSendMessageInput(body)

  const defaultThread = await ensureDefaultThread(bookId)
  const targetThreadId = input.threadId || defaultThread.id
  const targetThread = await getThread(bookId, targetThreadId)
  if (!targetThread || targetThread.status !== "active") {
    throw new ChatRequestError("当前线程不可发送消息", 409)
  }

  const selectedSkills = await resolveSkillSummaries(bookId, input.skillIds)
  const responseConstraints = await resolveResponseConstraintSnapshot(bookId, {
    threadId: targetThreadId,
    constraintIds: input.constraintIds,
    temporaryConstraints: input.temporaryConstraints,
  })
  const skillReferences = selectedSkills.map(({ skill }) => ({
    type: "skill",
    name: skill.id,
    path: skill.summaryFile || skill.sourceFile,
  }))
  const messageReferences = [
    ...input.references.map((card) => ({
      type: card.category,
      name: card.name,
      path: card.path ?? card.id,
    })),
    ...skillReferences,
  ]
  const { thread, turn, userMessage } = await createRunningTurn(
    bookId,
    targetThreadId,
    input.userText,
    messageReferences,
    responseConstraints,
  )

  try {
    const result = await runNovelGuideAgent({
      bookId,
      userMessage: input.userText,
      references: input.references,
      responseConstraints,
      skills: selectedSkills,
      threadId: thread.id,
    })
    const changedPaths = await recordAgentFileChanges(bookId, result.fileChanges)

    const events = [
      createAgentEvent(turn.id, { type: "observe", text: "已开始处理。" }),
      ...result.failedTools.map((failure) => createAgentEvent(turn.id, {
        type: "error" as const,
        message: failure,
      })),
      createAgentEvent(turn.id, {
        type: "done",
        text: changedPaths.length > 0
          ? `已写入 ${changedPaths.length} 个项目文件。`
          : result.toolTrace.length > 0
            ? "已读取项目资料并生成回复。"
            : "处理完成。",
        paths: changedPaths.length > 0 ? changedPaths : undefined,
      }),
    ]

    const brief = result.toolTrace.length > 0 ||
      result.failedTools.length > 0 ||
      result.usage.totalTokens > 0 ||
      changedPaths.length > 0
      ? {
          understood: ["已读取项目资料并生成回复。"],
          contextPaths: [result.workspacePath, ...skillReferences.map((reference) => reference.path)],
          changedPaths: changedPaths.length > 0 ? changedPaths : undefined,
          diagnosis: result.failedTools.length > 0 ? result.failedTools : undefined,
          toolTrace: result.toolTrace.length > 0 ? result.toolTrace : undefined,
        }
      : undefined
    const assistantContent = changedPaths.length > 0
      ? `${result.reply.trim()}\n\n${summarizeChangedPaths(changedPaths)}`
      : result.reply

    const assistantMessage = createAssistantMessage({
      threadId: thread.id,
      turnId: turn.id,
      content: assistantContent,
      brief,
      events,
    })
    await appendThreadMessages(bookId, [assistantMessage])
    const completedTurn = await updateTurn(bookId, turn.id, {
      assistantMessageId: assistantMessage.id,
      status: "done",
    })

    return {
      status: 200,
      payload: {
        thread,
        turn: completedTurn ?? { ...turn, assistantMessageId: assistantMessage.id, status: "done" },
        userMessage,
        assistantMessage,
        events,
      },
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "处理失败"
    const events = [
      createAgentEvent(turn.id, { type: "observe", text: "已接收请求并开始分析任务目标。" }),
      createAgentEvent(turn.id, { type: "error", message: errorMessage }),
    ]
    const assistantMessage = createAssistantMessage({
      threadId: thread.id,
      turnId: turn.id,
      content: "处理失败，请稍后重试。",
      events,
    })
    await appendThreadMessages(bookId, [assistantMessage]).catch(() => {})
    const failedTurn = await updateTurn(bookId, turn.id, {
      assistantMessageId: assistantMessage.id,
      status: "failed",
      error: errorMessage,
    })

    return {
      status: 500,
      payload: {
        thread,
        turn: failedTurn ?? { ...turn, assistantMessageId: assistantMessage.id, status: "failed", error: errorMessage },
        userMessage,
        assistantMessage,
        events,
      },
    }
  }
}

export function createThreadMessageStream(
  bookId: string,
  body: unknown,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      void withBookMutationQueue(bookId, () =>
        streamThreadMessageUnlocked(bookId, body, signal, controller)
      ).catch((err) => {
        emitSse(controller, "error", { message: err instanceof Error ? err.message : "处理失败" })
      }).finally(() => {
        controller.close()
      })
    },
    cancel() {
      // The route request signal is the cancellation source; this hook exists
      // for consumers that close the stream without aborting fetch explicitly.
    },
  })
}

async function streamThreadMessageUnlocked(
  bookId: string,
  body: unknown,
  signal: AbortSignal,
  controller: SseController,
): Promise<void> {
  const input = normalizeSendMessageInput(body)
  const defaultThread = await ensureDefaultThread(bookId)
  const targetThreadId = input.threadId || defaultThread.id
  const targetThread = await getThread(bookId, targetThreadId)
  if (!targetThread || targetThread.status !== "active") {
    throw new ChatRequestError("当前线程不可发送消息", 409)
  }

  const selectedSkills = await resolveSkillSummaries(bookId, input.skillIds)
  const responseConstraints = await resolveResponseConstraintSnapshot(bookId, {
    threadId: targetThreadId,
    constraintIds: input.constraintIds,
    temporaryConstraints: input.temporaryConstraints,
  })
  const skillReferences = selectedSkills.map(({ skill }) => ({
    type: "skill",
    name: skill.id,
    path: skill.summaryFile || skill.sourceFile,
  }))
  const messageReferences = [
    ...input.references.map((card) => ({
      type: card.category,
      name: card.name,
      path: card.path ?? card.id,
    })),
    ...skillReferences,
  ]
  const { thread, turn, userMessage } = await createRunningTurn(
    bookId,
    targetThreadId,
    input.userText,
    messageReferences,
    responseConstraints,
  )
  emitSse(controller, "turn", { thread, turn, userMessage })

  const events = [
    createAgentEvent(turn.id, { type: "observe", text: "已开始处理。" }),
  ]
  emitSse(controller, "agent_event", events[0])

  try {
    let finalResult: Awaited<ReturnType<typeof runNovelGuideAgent>> | null = null
    for await (const streamEvent of runNovelGuideAgentStream({
      bookId,
      userMessage: input.userText,
      references: input.references,
      responseConstraints,
      skills: selectedSkills,
      threadId: thread.id,
      signal,
    })) {
      if (streamEvent.type === "done") {
        finalResult = streamEvent.result
        continue
      }

      if (streamEvent.event.type !== "query_event") continue
      const engineEvent = streamEvent.event.event
      if (engineEvent.type === "model_start") {
        const event = createAgentEvent(turn.id, { type: "observe", text: `模型轮次 ${engineEvent.loop + 1}。` })
        events.push(event)
        emitSse(controller, "agent_event", event)
      } else if (engineEvent.type === "tool_call") {
        const event = createAgentEvent(turn.id, {
          type: "tool_call",
          name: engineEvent.name,
          argsPreview: engineEvent.argsPreview,
          text: engineEvent.name,
        })
        events.push(event)
        emitSse(controller, "agent_event", event)
      } else if (engineEvent.type === "assistant_message") {
        emitSse(controller, "assistant_delta", { text: engineEvent.text })
      } else if (engineEvent.type === "tool_result" && !engineEvent.ok) {
        const event = createAgentEvent(turn.id, { type: "error", message: `${engineEvent.name}: ${engineEvent.content}` })
        events.push(event)
        emitSse(controller, "agent_event", event)
      } else if (engineEvent.type === "error") {
        const event = createAgentEvent(turn.id, { type: "error", message: engineEvent.message })
        events.push(event)
        emitSse(controller, "agent_event", event)
      }
    }

    if (!finalResult) throw new Error("处理结束但没有返回结果")
    const changedPaths = await recordAgentFileChanges(bookId, finalResult.fileChanges)
    for (const failure of finalResult.failedTools) {
      const event = createAgentEvent(turn.id, { type: "error", message: failure })
      events.push(event)
      emitSse(controller, "agent_event", event)
    }
    const doneEvent = createAgentEvent(turn.id, {
      type: "done",
      text: changedPaths.length > 0
        ? `已写入 ${changedPaths.length} 个项目文件。`
        : finalResult.toolTrace.length > 0
          ? "已读取项目资料并生成回复。"
          : "处理完成。",
      paths: changedPaths.length > 0 ? changedPaths : undefined,
    })
    events.push(doneEvent)
    emitSse(controller, "agent_event", doneEvent)

    const brief = finalResult.toolTrace.length > 0 ||
      finalResult.failedTools.length > 0 ||
      finalResult.usage.totalTokens > 0 ||
      changedPaths.length > 0
      ? {
          understood: ["已读取项目资料并生成回复。"],
          contextPaths: [finalResult.workspacePath, ...skillReferences.map((reference) => reference.path)],
          changedPaths: changedPaths.length > 0 ? changedPaths : undefined,
          diagnosis: finalResult.failedTools.length > 0 ? finalResult.failedTools : undefined,
          toolTrace: finalResult.toolTrace.length > 0 ? finalResult.toolTrace : undefined,
        }
      : undefined
    const assistantContent = changedPaths.length > 0
      ? `${finalResult.reply.trim()}\n\n${summarizeChangedPaths(changedPaths)}`
      : finalResult.reply
    const assistantMessage = createAssistantMessage({
      threadId: thread.id,
      turnId: turn.id,
      content: assistantContent,
      brief,
      events,
    })
    await appendThreadMessages(bookId, [assistantMessage])
    const completedTurn = await updateTurn(bookId, turn.id, {
      assistantMessageId: assistantMessage.id,
      status: "done",
    })
    const payload = {
      thread,
      turn: completedTurn ?? { ...turn, assistantMessageId: assistantMessage.id, status: "done" },
      userMessage,
      assistantMessage,
      events,
    }
    emitSse(controller, "assistant_message", assistantMessage)
    emitSse(controller, "done", payload)
  } catch (err) {
    if (isAbortError(err) || signal.aborted) {
      const cancelledTurn = await updateTurn(bookId, turn.id, { status: "cancelled" })
      emitSse(controller, "done", {
        thread,
        turn: cancelledTurn ?? { ...turn, status: "cancelled" },
        userMessage,
        events,
        cancelled: true,
      })
      return
    }

    const errorMessage = err instanceof Error ? err.message : "处理失败"
    const event = createAgentEvent(turn.id, { type: "error", message: errorMessage })
    events.push(event)
    emitSse(controller, "agent_event", event)
    const assistantMessage = createAssistantMessage({
      threadId: thread.id,
      turnId: turn.id,
      content: "处理失败，请稍后重试。",
      events,
    })
    await appendThreadMessages(bookId, [assistantMessage]).catch(() => {})
    const failedTurn = await updateTurn(bookId, turn.id, {
      assistantMessageId: assistantMessage.id,
      status: "failed",
      error: errorMessage,
    })
    emitSse(controller, "assistant_message", assistantMessage)
    emitSse(controller, "done", {
      thread,
      turn: failedTurn ?? { ...turn, assistantMessageId: assistantMessage.id, status: "failed", error: errorMessage },
      userMessage,
      assistantMessage,
      events,
    })
  }
}

function emitSse(controller: SseController, event: string, data: unknown): void {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function normalizeSendMessageInput(body: unknown): {
  userText: string
  threadId: string | undefined
  references: SettingCard[]
  constraintIds: string[] | undefined
  skillIds: string[]
  temporaryConstraints: AppliedResponseConstraint[]
} {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const content = raw.content
  if (!content || typeof content !== "string") {
    throw new ChatRequestError("缺少 content", 400)
  }

  const threadId = typeof raw.threadId === "string" && raw.threadId.trim()
    ? raw.threadId
    : undefined

  return {
    userText: content.trim(),
    threadId,
    references: parseReferences(raw.references),
    constraintIds: parseConstraintIds(raw.constraintIds),
    skillIds: parseSkillIds(raw.skillIds),
    temporaryConstraints: parseTemporaryConstraints(raw.temporaryConstraints),
  }
}

function normalizeChangePath(bookId: string, rawPath: string): string | null {
  const trimmed = rawPath.trim()
  if (!trimmed) return null

  let normalized = trimmed.replace(/\\/g, "/")
  if (path.isAbsolute(trimmed)) {
    const relative = path.relative(getBookDir(bookId), path.resolve(trimmed))
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null
    normalized = relative.replace(/\\/g, "/")
  }

  normalized = normalized.replace(/^\.\/+/, "")
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length === 0 || segments.some((segment) => segment === "..")) return null

  const lowerSegments = segments.map((segment) => segment.toLowerCase())
  if (lowerSegments.some((segment) => INTERNAL_CHANGE_DIRS.has(segment))) return null
  if (INTERNAL_CHANGE_FILES.has(lowerSegments[lowerSegments.length - 1])) return null

  return segments.join("/")
}

function collectTrackedFileChanges(bookId: string, changes: FileChange[]): TrackedFileChange[] {
  const byPath = new Map<string, TrackedFileChange>()

  for (const change of changes) {
    if (!change || typeof change.path !== "string") continue
    const normalizedPath = normalizeChangePath(bookId, change.path)
    if (!normalizedPath) continue

    const existing = byPath.get(normalizedPath)
    if (existing) {
      existing.operation = change.operation
      existing.beforeExists = existing.beforeExists ?? change.beforeExists
      existing.charCount = change.charCount
      existing.afterContent = change.afterContent
      continue
    }

    byPath.set(normalizedPath, {
      ...change,
      path: normalizedPath,
    })
  }

  return [...byPath.values()]
}

function summarizeChangedPaths(paths: string[]): string {
  const visible = paths.slice(0, 6)
  const suffix = paths.length > visible.length ? ` 等 ${paths.length} 个文件` : ""
  return `已修改：${visible.map((item) => `\`${item}\``).join("、")}${suffix}`
}

async function recordAgentFileChanges(bookId: string, changes: FileChange[]): Promise<string[]> {
  const trackedChanges = collectTrackedFileChanges(bookId, changes)
  if (trackedChanges.length === 0) return []

  for (const change of trackedChanges) {
    const action = change.operation === "edit" ? "edit_file" : "write_file"
    await appendLedgerEntry(bookId, {
      actor: "agent",
      action,
      targetPath: change.path,
      beforeSnapshot: change.beforeContent ?? undefined,
      afterSnapshot: change.afterContent ?? "",
      summary: `AI ${change.operation === "edit" ? "编辑" : "写入"} ${change.path}`,
    })
    await markDirty(bookId, change.path).catch(() => {})
  }

  await touchBookUpdatedAt(bookId)
  await Promise.all(
    trackedChanges.map((change) =>
      updateIndexedFile(bookId, change.path, change.afterContent).catch(() => {}),
    ),
  )
  return trackedChanges.map((change) => change.path)
}

function parseReferences(value: unknown): SettingCard[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const raw = item as Record<string, unknown>
    const card = item as Partial<SettingCard>
    const category = raw.category === "place" ? "location" : card.category
    if (typeof card.id !== "string" || typeof card.name !== "string" || typeof card.summary !== "string") return []
    if (
      category !== "character" &&
      category !== "location" &&
      category !== "faction" &&
      category !== "mechanism" &&
      category !== "formation" &&
      category !== "event" &&
      category !== "rule" &&
      category !== "other"
    ) {
      return []
    }
    return [{
      id: card.id,
      category,
      name: card.name,
      summary: card.summary,
      content: typeof card.content === "string" ? card.content : undefined,
      path: typeof card.path === "string" ? card.path : undefined,
      meta: card.meta && typeof card.meta === "object" ? card.meta as Record<string, string> : undefined,
    }]
  })
}

function parseConstraintIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
}

function parseSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
}

function parseTemporaryConstraints(value: unknown): AppliedResponseConstraint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (typeof item === "string") {
      const instruction = item.trim()
      if (!instruction) return []
      return [{
        title: `本轮临时约束 ${index + 1}`,
        instruction,
        source: "temporary" as const,
      }]
    }
    if (!item || typeof item !== "object") return []
    const raw = item as Record<string, unknown>
    const instruction = typeof raw.instruction === "string" ? raw.instruction.trim() : ""
    if (!instruction) return []
    const title = typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : `本轮临时约束 ${index + 1}`
    return [{
      title,
      instruction,
      source: "temporary" as const,
    }]
  })
}
