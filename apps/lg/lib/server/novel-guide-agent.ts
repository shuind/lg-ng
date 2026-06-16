import {
  AgentEngine,
  createOpenAICompatibleClient,
  DRAFT_POLICY_RULES,
  type EngineContextWindowState,
  type EngineStreamEvent,
  type FileChange,
  type FileProposal,
  FILE_TRUTH_RULES,
  initNovelWorkspace,
  LG_CONTENT_DIRECTORY_RULES,
  loadSession,
  type ModelUsage,
  REVIEW_AGENT_BASE_PROMPT,
  REVIEW_AGENT_JSON_SCHEMA,
  REVIEW_SEMANTICS_RULES,
  WRITE_REPORTING_RULES,
} from "novel-guide"
import { getBook } from "@/lib/server/book-store"
import { getEffectiveOpenAICompatibleConfig } from "@/lib/server/app-settings-store"
import { listIndexedFiles, listIndexedSettingCards, type IndexedBookFile } from "@/lib/server/book-index"
import { getBookDir } from "@/lib/server/paths"
import { recordBillingUsage } from "@/lib/server/billing-store"
import { resolveUserMemoryForPrompt } from "@/lib/server/user-memory-store"
import type { BillingLedgerEntry } from "@/lib/billing"
import type { AppliedResponseConstraint, ChatReference, Message, SettingCard, SkillSummary, UserMemoryUsageSnapshot, WorkflowAction } from "@/lib/types"

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
  return {
    estimatedTokens: reserveTokens,
    budgetTokens: 128000,
    ratio: reserveTokens / 128000,
    triggerRatio: 0.75,
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

function formatReferences(references: ChatReference[]): string {
  if (references.length === 0) return ""
  const lines = references.map((reference) => {
    const path = reference.path ? ` path=${reference.path}` : ""
    const summary = reference.summary ? ` summary=${reference.summary}` : ""
    return `- ${reference.name} (${reference.type || reference.kind})${path}${summary}`
  })
  return [
    "LG 用户选中的引用：",
    "这些是用户明确选择的上下文。若引用有 path，涉及它的判断或修改前先读文件；不要把 summary 当完整内容。",
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
  const lines = skills.flatMap(({ skill, summary }) => [
    `- ${skill.name ?? skill.id} (${skill.type}) 来源=${skill.sourceFile} 摘要=${skill.summaryFile ?? "无"}`,
    summary.trim() ? summary.trim() : "  （摘要为空。必要时先读取源文件。）",
  ])
  return [
    "已选写作技能：",
    "把这些可复用写作规则作为本轮高优先级上下文。",
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

function formatThreadDelta(messages: Message[]): string {
  const visible = messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-4)

  if (visible.length === 0) return ""

  const lines = visible.map((message) => {
    const label = message.role === "user" ? "用户" : "助手"
    return `### ${label}\n${clipThreadMessage(message.content, message.role)}`
  })

  return [
    "LG 本轮可见对话增量：",
    "这些内容只补充最近的 UI 可见语境，不是完整历史；若与真实文件冲突，以文件为准。",
    ...lines,
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

const PROJECT_CONTEXT_CARD_LIMIT = 60
const PROJECT_CONTEXT_FILE_LIMIT = 80
const PROJECT_CONTEXT_SUMMARY_LIMIT = 160
const PROJECT_CONTEXT_FILE_EXTENSIONS = new Set([".md", ".json", ".txt"])

export type PromptTaskMode = "chat" | "continue" | "revise" | "review" | "archive" | "plan" | "diagnose"

const TASK_MODE_FILE_ROOT_PRIORITY: Record<PromptTaskMode, string[]> = {
  chat: ["NOVEL.md", "GUIDE.md", "canon", "人物设定", "世界观", "章节大纲", "drafts", "章节正文"],
  continue: ["NOVEL.md", "GUIDE.md", "drafts", "章节正文", "章节大纲", "卷纲", "人物设定", "世界观", "canon", "剧情管理"],
  revise: ["NOVEL.md", "GUIDE.md", "drafts", "章节正文", "章节大纲", "人物设定", "世界观", "canon", "写作约束", "读者体验"],
  review: ["NOVEL.md", "GUIDE.md", "检查报告", "章节正文", "drafts", "章节摘要", "canon", "人物设定", "世界观", "剧情管理", "状态追踪"],
  archive: ["NOVEL.md", "GUIDE.md", "canon", "candidates", "inbox", "人物设定", "世界观", "剧情管理", "状态追踪", "archive"],
  plan: ["NOVEL.md", "GUIDE.md", "卷纲", "章节大纲", "剧情管理", "章节摘要", "人物设定", "世界观", "canon", "drafts"],
  diagnose: ["NOVEL.md", "GUIDE.md", "剧情管理", "状态追踪", "章节大纲", "章节摘要", "drafts", "章节正文", "人物设定", "世界观", "canon"],
}

const TASK_MODE_CARD_CATEGORY_PRIORITY: Record<PromptTaskMode, SettingCard["category"][]> = {
  chat: ["character", "location", "faction", "mechanism", "event", "rule", "formation", "other"],
  continue: ["character", "event", "location", "faction", "mechanism", "rule", "formation", "other"],
  revise: ["character", "event", "rule", "location", "faction", "mechanism", "formation", "other"],
  review: ["event", "character", "rule", "location", "faction", "mechanism", "formation", "other"],
  archive: ["character", "location", "faction", "mechanism", "formation", "event", "rule", "other"],
  plan: ["event", "character", "location", "faction", "mechanism", "rule", "formation", "other"],
  diagnose: ["event", "character", "rule", "location", "faction", "mechanism", "formation", "other"],
}

function clipProjectContextText(value: string, maxLength = PROJECT_CONTEXT_SUMMARY_LIMIT): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized
}

function compareIndexedPaths(a: { path?: string }, b: { path?: string }): number {
  return (a.path ?? "").localeCompare(b.path ?? "", "zh-CN", { numeric: true })
}

export function inferPromptTaskMode(userMessage: string, workflowAction?: WorkflowAction): PromptTaskMode {
  if (workflowAction === "continue") return "continue"
  if (workflowAction === "revise") return "revise"
  if (workflowAction === "plan") return "plan"
  if (workflowAction === "diagnose") return "diagnose"
  if (workflowAction === "plant" || workflowAction === "resolve") return "archive"

  const normalized = userMessage.toLowerCase()
  if (/review|检查|审阅|看看有没有问题|前后矛盾|冲突|连续性/.test(normalized)) return "review"
  if (/归档|入典|入正典|整理进去|记下来|写入项目|更新设定|保存设定/.test(normalized)) return "archive"
  if (/续写|接着写|继续写/.test(normalized)) return "continue"
  if (/改稿|重写|润色|修改/.test(normalized)) return "revise"
  if (/计划|规划|大纲|章纲/.test(normalized)) return "plan"
  if (/卡点|诊断|哪里不对|怎么推进/.test(normalized)) return "diagnose"
  return "chat"
}

function scoreRootPriority(rootOrPath: string, priorities: string[]): number {
  const normalized = rootOrPath.replace(/\\/g, "/")
  const directIndex = priorities.indexOf(normalized)
  if (directIndex >= 0) return directIndex
  const root = normalized.split("/").filter(Boolean)[0] ?? normalized
  const rootIndex = priorities.indexOf(root)
  return rootIndex >= 0 ? rootIndex : priorities.length + 10
}

function compareSettingCardsForMode(mode: PromptTaskMode, a: SettingCard, b: SettingCard): number {
  const priorities = TASK_MODE_CARD_CATEGORY_PRIORITY[mode]
  const categoryDiff = priorities.indexOf(a.category) - priorities.indexOf(b.category)
  if (categoryDiff !== 0) return categoryDiff
  return compareIndexedPaths(a, b)
}

export function compareIndexedFilesForMode(mode: PromptTaskMode, a: IndexedBookFile, b: IndexedBookFile): number {
  const priorities = TASK_MODE_FILE_ROOT_PRIORITY[mode]
  const scoreA = scoreRootPriority(a.path || a.root, priorities)
  const scoreB = scoreRootPriority(b.path || b.root, priorities)
  if (scoreA !== scoreB) return scoreA - scoreB
  return compareIndexedPaths(a, b)
}

function formatIndexedFile(file: IndexedBookFile): string {
  const label = file.name.replace(/\.[^.]+$/i, "")
  return `- ${label} | ${file.root || "root"} | path=${file.path}`
}

async function buildStableProjectContext(bookId: string, mode: PromptTaskMode): Promise<string> {
  const [settingCards, files] = await Promise.all([
    listIndexedSettingCards(bookId).catch(() => []),
    listIndexedFiles(bookId).catch(() => []),
  ])
  const cardPaths = new Set(settingCards.flatMap((card) => card.path ? [card.path] : []))
  const cardLines = [...settingCards]
    .sort((a, b) => compareSettingCardsForMode(mode, a, b))
    .slice(0, PROJECT_CONTEXT_CARD_LIMIT)
    .map((card) => [
      `- ${card.name}`,
      card.category,
      clipProjectContextText(card.summary || ""),
      card.path ? `path=${card.path}` : "",
    ].filter(Boolean).join(" | "))

  const fileLines = [...files]
    .filter((file) => PROJECT_CONTEXT_FILE_EXTENSIONS.has(file.extension))
    .filter((file) => !cardPaths.has(file.path))
    .sort((a, b) => compareIndexedFilesForMode(mode, a, b))
    .slice(0, PROJECT_CONTEXT_FILE_LIMIT)
    .map(formatIndexedFile)

  return [
    "LG 稳定项目索引（短摘要和路径，不是完整事实）：",
    `任务模式：${mode}`,
    cardLines.length > 0 ? `设定卡：\n${cardLines.join("\n")}` : "设定卡：无",
    fileLines.length > 0 ? `工作区文件：\n${fileLines.join("\n")}` : "工作区文件：无",
  ].join("\n\n")
}

function isProposalWorkflow(action?: WorkflowAction): boolean {
  return action === "continue" || action === "revise"
}

function formatChapterDraftPolicy(): string {
  return [
    "章节草稿优先策略：",
    DRAFT_POLICY_RULES,
  ].join("\n")
}

function buildPrompt(input: {
  bookId: string
  bookTitle: string
  userMessage: string
  fullThreadMessages: Message[]
  threadDeltaMessages: Message[]
  references: ChatReference[]
  responseConstraints: AppliedResponseConstraint[]
  skills: SkillSummary[]
  workflowAction?: WorkflowAction
}): string {
  return [
    "# 本轮任务",
    `- 书籍：${input.bookTitle} (${input.bookId})`,
    `- 用户请求：${input.userMessage}`,
    `- 工作流：${input.workflowAction ?? "none"}`,
    `- 是否允许写入：${input.workflowAction === "diagnose" ? "否" : "按当前权限与任务决定"}`,
    `- 期望产物：${input.workflowAction === "plan" || input.workflowAction === "diagnose" ? "计划或诊断报告" : "回复、提案或写入结果"}`,
    "",
    "# 高优先级上下文",
    formatResponseConstraints(input.responseConstraints),
    formatSkillSummaries(input.skills),
    formatThreadDelta(input.threadDeltaMessages),
    formatThreadMessages(input.fullThreadMessages),
    formatReferences(input.references),
    "",
    "# 项目导航",
    formatChapterDraftPolicy(),
    formatWorkflowAction(input.workflowAction),
    `项目规则摘要：`,
    FILE_TRUTH_RULES,
    LG_CONTENT_DIRECTORY_RULES,
    REVIEW_SEMANTICS_RULES,
    WRITE_REPORTING_RULES,
    "",
    "# 执行规则",
    "1. 文件事实高于索引摘要和旧对话。",
    "2. 本轮用户明确要求高于默认工作流规则。",
    "3. 需要判断或修改前必须读取路径。",
    "4. 不足以执行时只问最小必要问题。",
    "5. 最终回复简短说明读了什么、做了什么、产物在哪里。",
  ].filter(Boolean).join("\n")
}

const LG_LEGACY_PROMPT = `LG 集成说明：
- ${LG_CONTENT_DIRECTORY_RULES}
- 回答前优先读真实文件；写文件时用工作区工具并报告变更。
- LG UI 另存聊天轮次；除非用户明确要求，不要编辑 thread-messages.jsonl。`

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
      reply: "当前模型不可用。请在设置页选择余额并确保有可用余额，或切换到自己的 API 并保存 DeepSeek API Key。",
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
  const taskMode = inferPromptTaskMode(input.userMessage, input.workflowAction)
  const projectContext = await buildStableProjectContext(input.bookId, taskMode)
  const userMemory = await resolveUserMemoryForPrompt({
    bookId: input.bookId,
    userMessage: input.userMessage,
  })

  const agentSessionId = input.agentSessionId ?? input.threadId
  const baseAgentSessionId = input.baseAgentSessionId ?? agentSessionId
  const session = await loadSession(workspacePath, baseAgentSessionId)
  const fullThreadMessages = session ? [] : input.threadMessages ?? []
  const threadDeltaMessages = session ? input.threadMessages ?? [] : []
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: agentSessionId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    projectContext,
    userMemoryContext: userMemory.context,
    permissionMode: "bypass",
    readonlyOnly: input.readonlyOnly,
    proposalOnly: isProposalWorkflow(input.workflowAction) && !input.readonlyOnly,
  })

  const result = await engine.submitMessage(buildPrompt({
    bookId: input.bookId,
    bookTitle,
    userMessage: input.userMessage,
    references: input.references ?? [],
    responseConstraints: input.responseConstraints ?? [],
    skills: input.skills ?? [],
    fullThreadMessages,
    threadDeltaMessages,
    workflowAction: input.workflowAction,
  }), { signal: input.signal })

  const billing = await recordBillingUsage({
    provider: config.provider,
    model: config.model,
    usage: result.usage,
    feature: "agent",
    paymentSource: config.paymentSource,
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
        reply: "当前模型不可用。请在设置页选择余额并确保有可用余额，或切换到自己的 API 并保存 DeepSeek API Key。",
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
  const taskMode = inferPromptTaskMode(input.userMessage, input.workflowAction)
  const projectContext = await buildStableProjectContext(input.bookId, taskMode)
  const userMemory = await resolveUserMemoryForPrompt({
    bookId: input.bookId,
    userMessage: input.userMessage,
  })

  const agentSessionId = input.agentSessionId ?? input.threadId
  const baseAgentSessionId = input.baseAgentSessionId ?? agentSessionId
  const session = await loadSession(workspacePath, baseAgentSessionId)
  const fullThreadMessages = session ? [] : input.threadMessages ?? []
  const threadDeltaMessages = session ? input.threadMessages ?? [] : []
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: agentSessionId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    projectContext,
    userMemoryContext: userMemory.context,
    permissionMode: "bypass",
    readonlyOnly: input.readonlyOnly,
    proposalOnly: isProposalWorkflow(input.workflowAction) && !input.readonlyOnly,
  })

  for await (const event of engine.submitMessageEvents(buildPrompt({
    bookId: input.bookId,
    bookTitle,
    userMessage: input.userMessage,
    references: input.references ?? [],
    responseConstraints: input.responseConstraints ?? [],
    skills: input.skills ?? [],
    fullThreadMessages,
    threadDeltaMessages,
    workflowAction: input.workflowAction,
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
      reply: "当前模型不可用。请在设置页选择余额并确保有可用余额，或切换到自己的 API 并保存 DeepSeek API Key。",
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
  const projectContext = await buildStableProjectContext(input.bookId, "review")

  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: input.threadId,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    projectContext,
    permissionMode: "bypass",
    maxLoops: 32,
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
          REVIEW_AGENT_BASE_PROMPT,
          "",
          "按你的专长执行只读小说健康检查。",
          REVIEW_AGENT_JSON_SCHEMA,
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
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        },
      }
    }
  }))
  const toolTrace = results.flatMap(({ checker, result }) =>
    result.toolTrace.length > 0 ? result.toolTrace : [`run_agent: ${checker.agent}`],
  )
  const failedTools = results.flatMap(({ result }) => result.failedTools)
  const completedLabels = results
    .filter(({ result }) => result.text.trim())
    .map(({ checker }) => checker.label)
  const failedLabels = results
    .filter(({ result }) => result.failedTools.length > 0)
    .map(({ checker }) => checker.label)
  const reply = [
    "# 小说健康检查",
    `- 范围：${scope}`,
    `- 已返回：${completedLabels.length > 0 ? completedLabels.join("、") : "无"}`,
    failedLabels.length > 0 ? `- 有失败项：${failedLabels.join("、")}` : "- 有失败项：无",
    "",
    ...results.map(({ checker, result }) => `## ${checker.label} (${checker.agent})\n\n${result.text.trim() || "未返回报告。"}`),
  ].join("\n\n")
  const usage = results.reduce((sum, { result }) => ({
    promptTokens: sum.promptTokens + result.usage.promptTokens,
    completionTokens: sum.completionTokens + result.usage.completionTokens,
    totalTokens: sum.totalTokens + result.usage.totalTokens,
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  const billing = await recordBillingUsage({
    provider: config.provider,
    model: config.model,
    usage,
    feature: "review",
    paymentSource: config.paymentSource,
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
