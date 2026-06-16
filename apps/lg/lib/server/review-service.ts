import { runNovelGuideReview } from "@/lib/server/novel-guide-agent"
import { withBookMutationQueue } from "@/lib/server/book-mutation-queue"
import { getDirtyFiles, type DirtyEntry } from "@/lib/server/dirty-index"
import {
  appendThreadMessages,
  createAgentEvent,
  createAssistantMessage,
  createRunningTurn,
  getThread,
  updateTurn,
} from "@/lib/server/thread-store"
import type { BillingLedgerEntry } from "@/lib/billing"
import type { ModelUsage } from "novel-guide"

export class ReviewRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

type ReviewKind = "continuity"

const INCREMENTAL_REVIEW_LIMIT = 12

interface ResolvedReviewScope {
  promptScope: string
  messageScope: string
  contextPaths: string[]
  incremental: boolean
}

function createReviewUsageEvent(
  turnId: string,
  usage: ModelUsage,
  billing: BillingLedgerEntry | null,
) {
  if (!usage.totalTokens && !billing) return null
  return createAgentEvent(turnId, {
    type: "observe",
    text: billing
      ? `token 用量：${billing.totalTokens ?? usage.totalTokens}，扣费：${billing.chargedAmountCny ?? 0}`
      : `token 用量：${usage.totalTokens}`,
    usage: {
      paymentSource: billing?.paymentSource,
      promptTokens: billing?.promptTokens ?? usage.promptTokens,
      promptCacheHitTokens: billing?.promptCacheHitTokens ?? usage.promptCacheHitTokens,
      promptCacheMissTokens: billing?.promptCacheMissTokens ?? usage.promptCacheMissTokens,
      completionTokens: billing?.completionTokens ?? usage.completionTokens,
      totalTokens: billing?.totalTokens ?? usage.totalTokens,
      estimatedCostCny: billing?.estimatedCostCny,
      chargedAmountCny: billing?.chargedAmountCny,
      commissionAmountCny: billing?.commissionAmountCny,
      balanceAfterCny: billing?.balanceAfterCny,
    },
  })
}

export async function runBookReview(bookId: string, body: unknown): Promise<{
  status: number
  payload: unknown
}> {
  return withBookMutationQueue(bookId, () => runBookReviewUnlocked(bookId, body))
}

async function runBookReviewUnlocked(bookId: string, body: unknown): Promise<{
  status: number
  payload: unknown
}> {
  const input = normalizeReviewInput(body)
  const targetThread = await getThread(bookId, input.threadId)
  if (!targetThread || targetThread.status !== "active") {
    throw new ReviewRequestError("当前线程不可体检", 409)
  }

  const reviewScope = await resolveReviewScope(bookId, input.scope)

  const { thread, turn, userMessage } = await createRunningTurn(
    bookId,
    targetThread.id,
    formatReviewUserMessage({ ...input, scope: reviewScope.messageScope }),
  )

  try {
    const result = await runNovelGuideReview({
      bookId,
      threadId: thread.id,
      scope: reviewScope.promptScope,
    })
    const usageEvent = createReviewUsageEvent(turn.id, result.usage, result.billing)
    const events = [
      createAgentEvent(turn.id, {
        type: "tool_call",
        name: "run_agent",
        text: reviewScope.incremental
          ? `incremental review: ${reviewScope.contextPaths.length} dirty file(s)`
          : "continuity + canon + pacing + voice",
        argsPreview: reviewScope.promptScope.slice(0, 600),
      }),
      ...result.failedTools.map((failure) => createAgentEvent(turn.id, {
        type: "error" as const,
        message: failure,
      })),
      ...(usageEvent ? [usageEvent] : []),
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
        understood: ["已运行连续性、设定冲突、节奏、文风体检。"],
        contextPaths: [result.workspacePath, ...reviewScope.contextPaths],
        toolTrace: result.toolTrace.length > 0 ? result.toolTrace : ["run_agent: multi-checker"],
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
      createAgentEvent(turn.id, { type: "tool_call", name: "run_agent", text: "multi-checker" }),
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

async function resolveReviewScope(bookId: string, requestedScope?: string): Promise<ResolvedReviewScope> {
  const explicitScope = requestedScope?.trim()
  if (explicitScope) {
    return {
      promptScope: explicitScope,
      messageScope: explicitScope,
      contextPaths: [],
      incremental: false,
    }
  }

  const dirtyEntries = (await getDirtyFiles(bookId))
    .filter((entry) => isReviewableDirtyPath(entry.path))
    .sort(compareDirtyEntries)

  if (dirtyEntries.length === 0) {
    return {
      promptScope: "全书当前项目",
      messageScope: "全书",
      contextPaths: [],
      incremental: false,
    }
  }

  const recentEntries = dirtyEntries.slice(0, INCREMENTAL_REVIEW_LIMIT)
  const changedChapters = recentEntries.filter((entry) => isLikelyChapterPath(entry.path))
  const relatedDirtyFiles = changedChapters.length > 0
    ? recentEntries.filter((entry) => !changedChapters.includes(entry))
    : []
  const primaryEntries = changedChapters.length > 0 ? changedChapters : recentEntries
  const overflowCount = Math.max(0, dirtyEntries.length - recentEntries.length)
  const messagePaths = recentEntries.slice(0, 3).map((entry) => entry.path).join(", ")
  const messageScope = [
    `增量（${recentEntries.length} 个 dirty 文件）`,
    messagePaths,
    overflowCount > 0 ? `另有 ${overflowCount} 个较早 dirty 文件未纳入默认范围` : "",
  ].filter(Boolean).join("；")

  return {
    promptScope: [
      "增量体检（来自 dirty-index）。",
      "默认不要扫描全书；只检查下列最近改动章节/文件，以及它们显式引用的人物、地点、规则、伏笔等 canon。",
      "对章节中出现的实体名、aliases、地点、规则和未决伏笔，优先使用 search_canon 查找相关 canon，再读取必要证据。",
      "如果必须越过该范围，请在报告中说明原因。",
      "",
      "Primary changed chapters/files:",
      ...primaryEntries.map(formatDirtyEntry),
      relatedDirtyFiles.length > 0 ? "" : undefined,
      relatedDirtyFiles.length > 0 ? "Other dirty context files:" : undefined,
      ...relatedDirtyFiles.map(formatDirtyEntry),
      overflowCount > 0 ? "" : undefined,
      overflowCount > 0 ? `Dirty-index also has ${overflowCount} older reviewable file(s); ignore them unless the primary scope references them directly.` : undefined,
    ].filter((line): line is string => line !== undefined).join("\n"),
    messageScope,
    contextPaths: recentEntries.map((entry) => entry.path),
    incremental: true,
  }
}

function compareDirtyEntries(a: DirtyEntry, b: DirtyEntry): number {
  const byDate = Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  return byDate || a.path.localeCompare(b.path)
}

function isReviewableDirtyPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase()
  if (!normalized || normalized.startsWith(".lg-data/")) return false
  return ![
    "ledger.jsonl",
    "proposals.jsonl",
    "thread-memory.json",
    "thread-messages.jsonl",
    "threads.json",
    "turns.json",
    "dirty-files.json",
  ].some((internalFile) => normalized.endsWith(internalFile))
}

function isLikelyChapterPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase()
  return (
    normalized.includes("/chapter") ||
    normalized.includes("chapters/") ||
    normalized.includes("draft") ||
    filePath.includes("章节") ||
    filePath.includes("正文")
  )
}

function formatDirtyEntry(entry: DirtyEntry): string {
  return `- ${entry.path} (dirtyAt ${entry.updatedAt})`
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
  return `体检：连续性 / 设定冲突 / 节奏 / 文风（${scope}）`
}
