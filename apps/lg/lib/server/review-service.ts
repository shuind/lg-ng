import { runNovelGuideReview } from "@/lib/server/novel-guide-agent"
import {
  appendThreadMessages,
  createAgentEvent,
  createAssistantMessage,
  createRunningTurn,
  getThread,
  updateTurn,
} from "@/lib/server/thread-store"

export class ReviewRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

type ReviewKind = "continuity"

export async function runBookReview(bookId: string, body: unknown): Promise<{
  status: number
  payload: unknown
}> {
  const input = normalizeReviewInput(body)
  const targetThread = await getThread(bookId, input.threadId)
  if (!targetThread || targetThread.status !== "active") {
    throw new ReviewRequestError("当前线程不可体检", 409)
  }

  const { thread, turn, userMessage } = await createRunningTurn(
    bookId,
    targetThread.id,
    formatReviewUserMessage(input),
  )

  try {
    const result = await runNovelGuideReview({
      bookId,
      threadId: thread.id,
      scope: input.scope,
    })
    const events = [
      createAgentEvent(turn.id, {
        type: "tool_call",
        name: "run_agent",
        text: "continuity-checker",
      }),
      ...result.failedTools.map((failure) => createAgentEvent(turn.id, {
        type: "error" as const,
        message: failure,
      })),
      createAgentEvent(turn.id, {
        type: "done",
        text: result.failedTools.length > 0 ? "体检完成，但存在工具问题。" : "体检完成。",
      }),
    ]
    const assistantMessage = createAssistantMessage({
      threadId: thread.id,
      turnId: turn.id,
      content: result.reply.trim() || "体检完成，未返回报告。",
      brief: {
        understood: ["已运行连续性体检。"],
        contextPaths: [result.workspacePath],
        toolTrace: result.toolTrace.length > 0 ? result.toolTrace : ["run_agent: continuity-checker"],
        diagnosis: result.failedTools.length > 0 ? result.failedTools : undefined,
      },
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
    const errorMessage = err instanceof Error ? err.message : "体检失败"
    const events = [
      createAgentEvent(turn.id, { type: "tool_call", name: "run_agent", text: "continuity-checker" }),
      createAgentEvent(turn.id, { type: "error", message: errorMessage }),
    ]
    const assistantMessage = createAssistantMessage({
      threadId: thread.id,
      turnId: turn.id,
      content: "体检失败，请稍后重试。",
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

function normalizeReviewInput(body: unknown): {
  threadId: string
  kind: ReviewKind
  scope?: string
} {
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const threadId = typeof raw.threadId === "string" ? raw.threadId.trim() : ""
  if (!threadId) {
    throw new ReviewRequestError("缺少 threadId", 400)
  }

  const kind = raw.kind === undefined ? "continuity" : raw.kind
  if (kind !== "continuity") {
    throw new ReviewRequestError("暂不支持该体检类型", 400)
  }

  const scope = typeof raw.scope === "string" && raw.scope.trim()
    ? raw.scope.trim().slice(0, 200)
    : undefined

  return { threadId, kind, scope }
}

function formatReviewUserMessage(input: {
  kind: ReviewKind
  scope?: string
}): string {
  const scope = input.scope?.trim() || "全书"
  return `体检：连续性检查（${scope}）`
}
