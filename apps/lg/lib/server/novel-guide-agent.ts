import {
  AgentEngine,
  createOpenAICompatibleClient,
  type EngineContextWindowState,
  type EngineModelUsageEvent,
  type EngineStreamEvent,
  type FileChange,
  type FileProposal,
  initNovelWorkspace,
  LG_CONTENT_DIRECTORY_RULES,
  loadSession,
  type ModelUsage,
} from "novel-guide"
import { getBook } from "@/lib/server/book-store"
import { getEffectiveOpenAICompatibleConfig } from "@/lib/server/app-settings-store"
import { recordApiCallUsage } from "@/lib/server/api-call-ledger"
import { getBookDir } from "@/lib/server/paths"
import { recordBillingUsage } from "@/lib/server/billing-store"
import { resolveUserMemoryForPrompt } from "@/lib/server/user-memory-store"
import { parseJsonFromModel } from "@/lib/server/llm-json"
import type { BillingLedgerEntry } from "@/lib/billing"
import type { AppliedResponseConstraint, ChatReference, Message, SkillSummary, UserMemoryUsageSnapshot, WorkflowAction } from "@/lib/types"

export interface NovelGuideAgentResult {
  reply: string
  sessionId: string
  toolTrace: string[]
  failedTools: string[]
  usage: ModelUsage
  contextWindow: EngineContextWindowState
  billing: BillingLedgerEntry | null
  workspacePath: string
  fileChanges: FileChange[]
  proposals: FileProposal[]
  usedMemory: UserMemoryUsageSnapshot[]
}

export interface NovelGuideReviewResult {
  reply: string
  sessionId: string
  toolTrace: string[]
  failedTools: string[]
  usage: ModelUsage
  billing: BillingLedgerEntry | null
  workspacePath: string
}

export type NovelGuideAgentStreamEvent =
  | { type: "engine_event"; event: EngineStreamEvent }
  | { type: "done"; result: NovelGuideAgentResult }

function emptyContextWindow(): EngineContextWindowState {
  const reserveTokens = 4096
  const budgetTokens = 128000
  const triggerTokens = 96000
  return {
    estimatedTokens: reserveTokens,
    budgetTokens,
    ratio: reserveTokens / budgetTokens,
    triggerRatio: triggerTokens / budgetTokens,
    triggerTokens,
    level: "normal",
    reserveTokens,
    components: {
      sessionMessages: 0,
      projectContext: 0,
      currentPrompt: 0,
      expectedOutputReserve: reserveTokens,
      total: reserveTokens,
    },
  }
}

function createApiUsageRecorder(input: {
  provider: string
  model: string
  paymentSource: "balance" | "api"
  feature: string
  bookId: string
  threadId: string
  agentSessionId?: string
}) {
  return async (event: EngineModelUsageEvent) => {
    await recordApiCallUsage({
      provider: input.provider,
      model: input.model,
      paymentSource: input.paymentSource,
      feature: input.feature,
      bookId: input.bookId,
      threadId: input.threadId,
      agentSessionId: input.agentSessionId,
      operation: event.operation,
      stream: event.stream,
      durationMs: event.durationMs,
      loop: event.loop,
      usage: event.usage,
      totalUsage: event.totalUsage,
    })
  }
}

function formatReferences(references: ChatReference[]): string {
  if (references.length === 0) return ""
  const lines = references.map((reference) => {
    const path = reference.path ? ` path=${reference.path}` : ""
    const summary = reference.summary ? ` summary=${reference.summary}` : ""
    return `- ${reference.name} (${reference.type || reference.kind})${path}${summary}`
  })
  return [
    "LG 用户选中的引用：",
    "这些是用户明确选择的上下文。若引用有 summary，它只是用户侧摘要，不是完整内容。",
    ...lines,
  ].join("\n")
}

function formatResponseConstraints(responseConstraints: AppliedResponseConstraint[]): string {
  if (responseConstraints.length === 0) return ""
  const lines = responseConstraints.map((constraint) => {
    const source = constraint.source === "temporary" ? "临时" : "库"
    return `- [${source}] ${constraint.title}: ${constraint.instruction}`
  })
  return [
    "回复约束：",
    "只约束最终回复的措辞、语气和输出边界。",
    "不改变文件读写能力、工具权限或可执行任务范围。",
    "若与本轮用户请求直接冲突，以本轮请求为准；否则严格遵守所有启用约束。",
    ...lines,
  ].join("\n")
}

function formatSkillSummaries(skills: SkillSummary[]): string {
  if (skills.length === 0) return ""
  const lines = skills.map(({ skill, summary }) => {
    const source = skill.summaryFile || skill.sourceFile
    const preview = summary.trim().replace(/\s+/g, " ")
    return `- ${skill.name ?? skill.id} (${skill.type}) | path=${source}${preview ? ` | ${preview.slice(0, 240)}` : ""}`
  })
  return [
    "已选写作技能：",
    ...lines,
  ].join("\n")
}

function formatThreadMessages(messages: Message[]): string {
  const visible = messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-8)

  if (visible.length === 0) return ""

  const lines = visible.map((message) => {
    const label = message.role === "user" ? "用户" : "助手"
    return `### ${label}\n${clipThreadMessage(message.content, message.role)}`
  })

  return [
    "LG 前文对话：",
    "这些是本轮请求前可见的聊天消息；用于对话上下文，尤其保留用户纠正和已确定项目事实。",
    ...lines,
  ].join("\n")
}

function formatUserRequest(userMessage: string): string {
  const quoted = userMessage.trim().split(/\r?\n/).map((line) => `> ${line}`).join("\n")
  return [
    "用户原文：",
    quoted || "> （空）",
  ].join("\n")
}

function clipThreadMessage(content: string, role: Message["role"]): string {
  const maxLength = role === "assistant" ? 2400 : 1600
  const normalized = content.trim()
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}\n...[截断]`
    : normalized
}

function formatWorkflowAction(action?: WorkflowAction): string {
  if (!action) return ""
  const instructions: Record<WorkflowAction, string> = {
    continue: "/续写：用 propose_file_change 生成可审阅续写提案。",
    revise: "/改稿：用 propose_file_change 生成具体 diff 提案。",
    plant: "/铺垫：需要写入时，埋一个 open 伏笔，并维护 NOVEL.md 的 当前 open 伏笔。",
    resolve: "/收线：先检查 open 伏笔，选定被引用伏笔，并确认回收自洽后再写。",
    diagnose: "/卡点诊断：读上下文，给多个后续方向。除非用户明确要求写入，否则只读。",
    plan: "/计划：先产出章节/行动计划。本轮不写文件，除非用户明确要求执行计划。",
  }
  return [
    "已选工作流：",
    `- 动作：${action}`,
    `- 说明：${instructions[action]}`,
    `- 允许写入：${action === "diagnose" ? "否" : "按用户本轮要求决定"}`,
    `- 默认目标：${action === "continue" || action === "revise" ? "drafts/" : "由任务决定"}`,
    `- 最终输出：${action === "plan" || action === "diagnose" ? "计划或诊断报告" : "提案或写入结果"}`,
  ].join("\n")
}

function hasExplicitDirectWriteIntent(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase()
  return (
    /(直接|立刻|马上|现在)?\s*(保存|写入|写进|写到|存到|落盘|应用|套用|更新到|改到|替换到)/.test(normalized) ||
    /(不要|不用|无需|别)\s*(提案|proposal|待采纳|预览)/.test(normalized) ||
    /(directly|save|apply|write)\s+(to|into|the file|directly)/.test(normalized)
  )
}

function shouldUseProposalOnly(input: {
  workflowAction?: WorkflowAction
  readonlyOnly?: boolean
  userMessage: string
}): boolean {
  if (!isProposalWorkflow(input.workflowAction) || input.readonlyOnly) return false
  return !hasExplicitDirectWriteIntent(input.userMessage)
}

function formatWritePolicy(input: {
  workflowAction?: WorkflowAction
  readonlyOnly?: boolean
  proposalOnly: boolean
  directWriteIntent: boolean
}): string {
  if (input.readonlyOnly || input.workflowAction === "diagnose") {
    return "只读：不要写文件，只输出诊断、计划或回答。"
  }
  if (input.proposalOnly) {
    return "提案模式：本轮只生成可审阅 proposal，不直接写入项目文件。"
  }
  if (isProposalWorkflow(input.workflowAction) && input.directWriteIntent) {
    return "直写模式：用户本轮明确要求保存/写入/应用；允许按工具权限直接写入目标文件，并报告真实变更。"
  }
  return "按当前权限与任务决定。"
}

function isProposalWorkflow(action?: WorkflowAction): boolean {
  return action === "continue" || action === "revise"
}

function buildPrompt(input: {
  bookId: string
  bookTitle: string
  userMessage: string
  fullThreadMessages: Message[]
  references: ChatReference[]
  responseConstraints: AppliedResponseConstraint[]
  skills: SkillSummary[]
  workflowAction?: WorkflowAction
  readonlyOnly?: boolean
  proposalOnly: boolean
}): string {
  const directWriteIntent = hasExplicitDirectWriteIntent(input.userMessage)
  const writePolicy = formatWritePolicy({
    workflowAction: input.workflowAction,
    readonlyOnly: input.readonlyOnly,
    proposalOnly: input.proposalOnly,
    directWriteIntent,
  })
  const hasNonDefaultWritePolicy = input.workflowAction || input.readonlyOnly || input.proposalOnly || directWriteIntent
  const expectedOutput = input.workflowAction === "plan" || input.workflowAction === "diagnose"
    ? "计划或诊断报告"
    : undefined
  const contextSections = [
    formatResponseConstraints(input.responseConstraints),
    formatSkillSummaries(input.skills),
    formatThreadMessages(input.fullThreadMessages),
    formatReferences(input.references),
  ].filter(Boolean)
  return [
    "# 本轮任务",
    `- 书籍：${input.bookTitle} (${input.bookId})`,
    input.workflowAction ? `- 工作流：${input.workflowAction}` : "",
    hasNonDefaultWritePolicy ? `- 写入策略：${writePolicy}` : "",
    expectedOutput ? `- 期望产物：${expectedOutput}` : "",
    "",
    formatUserRequest(input.userMessage),
    contextSections.length > 0 ? "# 高优先级上下文" : "",
    ...contextSections,
    "",
    formatWorkflowAction(input.workflowAction),
  ].filter(Boolean).join("\n")
}

const LG_LEGACY_PROMPT = `LG 集成说明：
${LG_CONTENT_DIRECTORY_RULES.split("\n").map((line) => `- ${line}`).join("\n")}
- LG UI 另存聊天轮次；除非用户明确要求，不要编辑 thread-messages.jsonl。`

type ReviewChecker = {
  agent: string
  label: string
}

type ReviewSeverity = "high" | "medium" | "low"
type ReviewConfidence = "high" | "medium" | "low"

interface ReviewEvidence {
  path: string
  line?: number
  excerpt: string
}

interface ReviewIssue {
  checker: ReviewChecker
  type: string
  severity: ReviewSeverity
  confidence: ReviewConfidence
  message: string
  evidence: ReviewEvidence[]
  whyItMatters: string
  suggestion: string
}

interface ReviewReport {
  checker: ReviewChecker
  summary: string
  coverage: {
    read: string[]
    notRead: string[]
    confidence: ReviewConfidence
  }
  issues: ReviewIssue[]
  questions: string[]
  nextActions: string[]
}

function normalizeReviewSeverity(value: unknown): ReviewSeverity {
  return value === "high" || value === "medium" || value === "low" ? value : "medium"
}

function normalizeReviewConfidence(value: unknown): ReviewConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "medium"
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : []
}

function normalizeReviewEvidence(value: unknown): ReviewEvidence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ReviewEvidence[] => {
    const record = asRecord(item)
    const filePath = typeof record.path === "string" ? record.path.trim() : ""
    const excerpt = typeof record.excerpt === "string" ? record.excerpt.trim() : ""
    if (!filePath || !excerpt) return []
    const line = typeof record.line === "number" && Number.isFinite(record.line)
      ? Math.max(1, Math.trunc(record.line))
      : undefined
    return [{ path: filePath, line, excerpt }]
  })
}

function parseReviewReport(text: string, checker: ReviewChecker): ReviewReport | null {
  try {
    const raw = asRecord(parseJsonFromModel(text))
    const coverage = asRecord(raw.coverage)
    const issues = Array.isArray(raw.issues) ? raw.issues : []
    return {
      checker,
      summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "未返回摘要。",
      coverage: {
        read: stringArray(coverage.read),
        notRead: stringArray(coverage.notRead),
        confidence: normalizeReviewConfidence(coverage.confidence),
      },
      issues: issues.flatMap((issue): ReviewIssue[] => {
        const record = asRecord(issue)
        const message = typeof record.message === "string" ? record.message.trim() : ""
        const evidence = normalizeReviewEvidence(record.evidence)
        if (!message || evidence.length === 0) return []
        return [{
          checker,
          type: typeof record.type === "string" && record.type.trim() ? record.type.trim() : "unknown",
          severity: normalizeReviewSeverity(record.severity),
          confidence: normalizeReviewConfidence(record.confidence),
          message,
          evidence,
          whyItMatters: typeof record.whyItMatters === "string" ? record.whyItMatters.trim() : "",
          suggestion: typeof record.suggestion === "string" ? record.suggestion.trim() : "",
        }]
      }),
      questions: stringArray(raw.questions),
      nextActions: stringArray(raw.nextActions),
    }
  } catch {
    return null
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function severityRank(value: ReviewSeverity): number {
  if (value === "high") return 0
  if (value === "medium") return 1
  return 2
}

function confidenceRank(value: ReviewConfidence): number {
  if (value === "high") return 0
  if (value === "medium") return 1
  return 2
}

function dedupeReviewIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const seen = new Set<string>()
  const result: ReviewIssue[] = []
  for (const issue of issues.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity) ||
    confidenceRank(a.confidence) - confidenceRank(b.confidence) ||
    a.checker.label.localeCompare(b.checker.label, "zh-CN")
  )) {
    const firstEvidence = issue.evidence[0]
    const key = [
      issue.type,
      issue.message,
      firstEvidence?.path ?? "",
      firstEvidence?.excerpt ?? "",
    ].join("\n")
    if (seen.has(key)) continue
    seen.add(key)
    result.push(issue)
  }
  return result
}

function formatReviewEvidence(evidence: ReviewEvidence[]): string {
  return evidence.slice(0, 3).map((item) => {
    const line = item.line ? `:${item.line}` : ""
    return `${item.path}${line}「${item.excerpt}」`
  }).join("；")
}

function renderReviewList(title: string, items: string[]): string {
  if (items.length === 0) return `## ${title}\n\n无。`
  return [`## ${title}`, "", ...items.map((item, index) => `${index + 1}. ${item}`)].join("\n")
}

function renderMergedReviewReply(input: {
  scope: string
  results: { checker: ReviewChecker; text: string; failedTools: string[] }[]
}): string {
  const parsed = input.results.map(({ checker, text }) => ({
    checker,
    report: text.trim() ? parseReviewReport(text, checker) : null,
    text,
  }))
  const reports = parsed.flatMap((item) => item.report ? [item.report] : [])
  const unparsed = parsed.filter((item) => !item.report && item.text.trim())
  const completedLabels = input.results.filter((item) => item.text.trim()).map((item) => item.checker.label)
  const failedLabels = input.results.filter((item) => item.failedTools.length > 0).map((item) => item.checker.label)
  const issues = dedupeReviewIssues(reports.flatMap((report) => report.issues)).slice(0, 20)
  const questions = uniqueStrings(reports.flatMap((report) => report.questions)).slice(0, 20)
  const nextActions = uniqueStrings(reports.flatMap((report) => report.nextActions)).slice(0, 12)

  const issueLines = issues.length > 0
    ? issues.map((issue, index) => [
        `${index + 1}. [${issue.severity}/${issue.confidence}] ${issue.checker.label} · ${issue.type}: ${issue.message}`,
        `   证据：${formatReviewEvidence(issue.evidence)}`,
        issue.whyItMatters ? `   影响：${issue.whyItMatters}` : "",
        issue.suggestion ? `   建议：${issue.suggestion}` : "",
      ].filter(Boolean).join("\n"))
    : ["未发现有文件证据支撑的明确问题。"]

  const coverageSections = reports.map((report) => [
    `### ${report.checker.label} (${report.coverage.confidence})`,
    report.summary,
    report.coverage.read.length > 0 ? `已读：${report.coverage.read.join("、")}` : "已读：未声明",
    report.coverage.notRead.length > 0 ? `未读/边界：${report.coverage.notRead.join("、")}` : "未读/边界：无",
  ].join("\n"))

  return [
    "# 小说健康检查",
    `- 范围：${input.scope}`,
    `- 已返回：${completedLabels.length > 0 ? completedLabels.join("、") : "无"}`,
    failedLabels.length > 0 ? `- 有失败项：${failedLabels.join("、")}` : "- 有失败项：无",
    unparsed.length > 0 ? `- 未能结构化解析：${unparsed.map((item) => item.checker.label).join("、")}` : "- 未能结构化解析：无",
    "",
    "## Issues",
    "",
    ...issueLines,
    "",
    renderReviewList("Questions", questions),
    "",
    renderReviewList("Next Actions", nextActions),
    "",
    "## Coverage",
    "",
    coverageSections.length > 0 ? coverageSections.join("\n\n") : "无结构化 coverage。",
    unparsed.length > 0 ? "" : undefined,
    unparsed.length > 0 ? "## 未结构化原文" : undefined,
    ...unparsed.map((item) => `### ${item.checker.label} (${item.checker.agent})\n\n${item.text.trim()}`),
  ].filter((line): line is string => line !== undefined).join("\n")
}

export async function runNovelGuideAgent(input: {
  bookId: string
  userMessage: string
  references?: ChatReference[]
  responseConstraints?: AppliedResponseConstraint[]
  skills?: SkillSummary[]
  threadMessages?: Message[]
  threadId: string
  agentSessionId?: string
  baseAgentSessionId?: string
  signal?: AbortSignal
  readonlyOnly?: boolean
  workflowAction?: WorkflowAction
}): Promise<NovelGuideAgentResult> {
  const config = getEffectiveOpenAICompatibleConfig()
  if (!config) {
    return {
      reply: "当前模型不可用。请在设置页选择余额并确保有可用余额，或切换到自己的 API 并保存模型 API Key。",
      sessionId: input.threadId,
      toolTrace: [],
      failedTools: ["model_config: missing API key"],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      contextWindow: emptyContextWindow(),
      billing: null,
      workspacePath: getBookDir(input.bookId),
      fileChanges: [],
      proposals: [],
      usedMemory: [],
    }
  }

  const book = await getBook(input.bookId)
  const workspacePath = getBookDir(input.bookId)
  const bookTitle = book?.title ?? input.bookId
  await initNovelWorkspace(workspacePath, bookTitle)

  const agentSessionId = input.agentSessionId ?? input.threadId
  const baseAgentSessionId = input.baseAgentSessionId ?? agentSessionId
  const session = await loadSession(workspacePath, baseAgentSessionId)
  const fullThreadMessages = session ? [] : input.threadMessages ?? []
  const proposalOnly = shouldUseProposalOnly({
    workflowAction: input.workflowAction,
    readonlyOnly: input.readonlyOnly,
    userMessage: input.userMessage,
  })
  const userMemory = await resolveUserMemoryForPrompt({
    bookId: input.bookId,
    userMessage: input.userMessage,
  })
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: agentSessionId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    disableProjectContext: true,
    userMemoryContext: userMemory.context,
    permissionMode: "bypass",
    readonlyOnly: input.readonlyOnly,
    proposalOnly,
    onModelUsage: createApiUsageRecorder({
      provider: config.provider,
      model: config.model,
      paymentSource: config.paymentSource,
      feature: "agent",
      bookId: input.bookId,
      threadId: input.threadId,
      agentSessionId,
    }),
  })

  const result = await engine.submitMessage(buildPrompt({
    bookId: input.bookId,
    bookTitle,
    userMessage: input.userMessage,
    references: input.references ?? [],
    responseConstraints: input.responseConstraints ?? [],
    skills: input.skills ?? [],
    fullThreadMessages,
    workflowAction: input.workflowAction,
    readonlyOnly: input.readonlyOnly,
    proposalOnly,
  }), { signal: input.signal })

  const billing = await recordBillingUsage({
    provider: config.provider,
    model: config.model,
    usage: result.usage,
    feature: "agent",
    paymentSource: config.paymentSource,
    pricing: config.pricing,
  })

  return {
    reply: result.text,
    sessionId: result.sessionId,
    toolTrace: result.toolTrace,
    failedTools: result.failedTools,
    usage: result.usage,
    contextWindow: result.contextWindow,
    billing,
    workspacePath,
    fileChanges: result.fileChanges,
    proposals: result.proposals,
    usedMemory: userMemory.usedMemory,
  }
}

export async function* runNovelGuideAgentStream(input: {
  bookId: string
  userMessage: string
  references?: ChatReference[]
  responseConstraints?: AppliedResponseConstraint[]
  skills?: SkillSummary[]
  threadMessages?: Message[]
  threadId: string
  agentSessionId?: string
  baseAgentSessionId?: string
  signal?: AbortSignal
  readonlyOnly?: boolean
  workflowAction?: WorkflowAction
}): AsyncGenerator<NovelGuideAgentStreamEvent> {
  const config = getEffectiveOpenAICompatibleConfig()
  if (!config) {
    yield {
      type: "done",
      result: {
        reply: "当前模型不可用。请在设置页选择余额并确保有可用余额，或切换到自己的 API 并保存模型 API Key。",
        sessionId: input.threadId,
        toolTrace: [],
        failedTools: ["model_config: missing API key"],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        contextWindow: emptyContextWindow(),
        billing: null,
        workspacePath: getBookDir(input.bookId),
        fileChanges: [],
        proposals: [],
        usedMemory: [],
      },
    }
    return
  }

  const book = await getBook(input.bookId)
  const workspacePath = getBookDir(input.bookId)
  const bookTitle = book?.title ?? input.bookId
  await initNovelWorkspace(workspacePath, bookTitle)

  const agentSessionId = input.agentSessionId ?? input.threadId
  const baseAgentSessionId = input.baseAgentSessionId ?? agentSessionId
  const session = await loadSession(workspacePath, baseAgentSessionId)
  const fullThreadMessages = session ? [] : input.threadMessages ?? []
  const proposalOnly = shouldUseProposalOnly({
    workflowAction: input.workflowAction,
    readonlyOnly: input.readonlyOnly,
    userMessage: input.userMessage,
  })
  const userMemory = await resolveUserMemoryForPrompt({
    bookId: input.bookId,
    userMessage: input.userMessage,
  })
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: agentSessionId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    disableProjectContext: true,
    userMemoryContext: userMemory.context,
    permissionMode: "bypass",
    readonlyOnly: input.readonlyOnly,
    proposalOnly,
    onModelUsage: createApiUsageRecorder({
      provider: config.provider,
      model: config.model,
      paymentSource: config.paymentSource,
      feature: "agent_stream",
      bookId: input.bookId,
      threadId: input.threadId,
      agentSessionId,
    }),
  })

  for await (const event of engine.submitMessageEvents(buildPrompt({
    bookId: input.bookId,
    bookTitle,
    userMessage: input.userMessage,
    references: input.references ?? [],
    responseConstraints: input.responseConstraints ?? [],
    skills: input.skills ?? [],
    fullThreadMessages,
    workflowAction: input.workflowAction,
    readonlyOnly: input.readonlyOnly,
    proposalOnly,
  }), { signal: input.signal })) {
    if (event.type !== "done") {
      yield { type: "engine_event", event }
      continue
    }
    const billing = await recordBillingUsage({
      provider: config.provider,
      model: config.model,
      usage: event.result.usage,
      feature: "agent_stream",
      paymentSource: config.paymentSource,
      pricing: config.pricing,
    })
    yield {
      type: "done",
      result: {
        reply: event.result.text,
        sessionId: event.result.sessionId,
        toolTrace: event.result.toolTrace,
        failedTools: event.result.failedTools,
        usage: event.result.usage,
        contextWindow: event.result.contextWindow,
        billing,
        workspacePath,
        fileChanges: event.result.fileChanges,
        proposals: event.result.proposals,
        usedMemory: userMemory.usedMemory,
      },
    }
  }
}

export async function runNovelGuideReview(input: {
  bookId: string
  threadId: string
  scope?: string
}): Promise<NovelGuideReviewResult> {
  const config = getEffectiveOpenAICompatibleConfig()
  if (!config) {
    return {
      reply: "当前模型不可用。请在设置页选择余额并确保有可用余额，或切换到自己的 API 并保存模型 API Key。",
      sessionId: input.threadId,
      toolTrace: [],
      failedTools: ["model_config: missing API key"],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      billing: null,
      workspacePath: getBookDir(input.bookId),
    }
  }

  const book = await getBook(input.bookId)
  const workspacePath = getBookDir(input.bookId)
  const bookTitle = book?.title ?? input.bookId
  await initNovelWorkspace(workspacePath, bookTitle)

  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: input.threadId,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    disableProjectContext: true,
    permissionMode: "bypass",
    maxLoops: 32,
    onModelUsage: createApiUsageRecorder({
      provider: config.provider,
      model: config.model,
      paymentSource: config.paymentSource,
      feature: "review",
      bookId: input.bookId,
      threadId: input.threadId,
      agentSessionId: input.threadId,
    }),
  })

  const scope = input.scope?.trim() || "全书当前项目"
  const checkers = [
    { agent: "continuity-checker", label: "连续性" },
    { agent: "canon-conflict", label: "设定冲突" },
    { agent: "pacing-checker", label: "节奏" },
    { agent: "voice-checker", label: "文风" },
  ]
  const results = await Promise.all(checkers.map(async (checker) => {
    try {
      const result = await engine.runSubAgent({
        agent: checker.agent,
        readonly: true,
        prompt: [
          `书籍：${bookTitle} (${input.bookId})`,
          `检查范围：${scope}`,
          "",
          "按你的专长执行只读小说健康检查。",
          "遵守你自身 prompt 里的共享评审规则、专属 severity 锚点和 JSON-in-markdown schema。",
          "不要修改文件。",
        ].join("\n"),
      })
      return { checker, result }
    } catch (error) {
      return {
        checker,
        result: {
          text: "",
          sessionId: input.threadId,
          messages: [],
          toolTrace: [],
          failedTools: [`${checker.agent}: ${error instanceof Error ? error.message : "failed"}`],
          fileChanges: [],
          usage: {
            promptTokens: 0,
            promptCacheHitTokens: 0,
            promptCacheMissTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        },
      }
    }
  }))
  const toolTrace = results.flatMap(({ checker, result }) =>
    result.toolTrace.length > 0 ? result.toolTrace : [`run_agent: ${checker.agent}`],
  )
  const failedTools = results.flatMap(({ result }) => result.failedTools)
  const reply = renderMergedReviewReply({
    scope,
    results: results.map(({ checker, result }) => ({
      checker,
      text: result.text,
      failedTools: result.failedTools,
    })),
  })
  const usage = results.reduce<ModelUsage>((sum, { result }) => ({
    promptTokens: sum.promptTokens + result.usage.promptTokens,
    promptCacheHitTokens: (sum.promptCacheHitTokens ?? 0) + (result.usage.promptCacheHitTokens ?? 0),
    promptCacheMissTokens: (sum.promptCacheMissTokens ?? 0) + (result.usage.promptCacheMissTokens ?? 0),
    completionTokens: sum.completionTokens + result.usage.completionTokens,
    totalTokens: sum.totalTokens + result.usage.totalTokens,
  }), {
    promptTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  })
  const billing = await recordBillingUsage({
    provider: config.provider,
    model: config.model,
    usage,
    feature: "review",
    paymentSource: config.paymentSource,
    pricing: config.pricing,
  })

  return {
    reply,
    sessionId: input.threadId,
    toolTrace,
    failedTools,
    usage,
    billing,
    workspacePath,
  }
}
