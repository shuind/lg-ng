import {
  AgentEngine,
  createOpenAICompatibleClient,
  type EngineContextWindowState,
  type EngineStreamEvent,
  type FileChange,
  type FileProposal,
  initNovelWorkspace,
  loadSession,
  type ModelUsage,
} from "novel-guide"
import { getBook } from "@/lib/server/book-store"
import { getEffectiveOpenAICompatibleConfig } from "@/lib/server/app-settings-store"
import { listIndexedFiles, listIndexedSettingCards, type IndexedBookFile } from "@/lib/server/book-index"
import { getBookDir } from "@/lib/server/paths"
import { recordBillingUsage } from "@/lib/server/billing-store"
import type { BillingLedgerEntry } from "@/lib/billing"
import type { AppliedResponseConstraint, ChatReference, Message, SkillSummary, WorkflowAction } from "@/lib/types"

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
  return {
    estimatedTokens: 0,
    budgetTokens: 128000,
    ratio: 0,
    triggerRatio: 0.85,
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
    continue: "/续写：用 propose_file_change 生成可审阅续写提案。生成正文默认放 drafts/；仅当用户明确要求直接应用到章节正文时才用 章节正文/。不要直接写目标文件。",
    revise: "/改稿：用 propose_file_change 生成具体 diff 提案。改章节正文时默认放 drafts/；仅当用户明确要求直接应用到章节正文时才用 章节正文/。优先小改，不直接写目标文件。",
    plant: "/铺垫：需要写入时，埋一个 open 伏笔，并维护 NOVEL.md 的 当前 open 伏笔。",
    resolve: "/收线：先检查 open 伏笔，选定被引用伏笔，并确认回收自洽后再写。",
    diagnose: "/卡点诊断：读上下文，给多个后续方向。除非用户明确要求写入，否则只读。",
    plan: "/计划：先产出章节/行动计划。本轮不写文件，除非用户明确要求执行计划。",
  }
  return `已选工作流：\n${instructions[action]}`
}

const PROJECT_CONTEXT_CARD_LIMIT = 60
const PROJECT_CONTEXT_FILE_LIMIT = 80
const PROJECT_CONTEXT_SUMMARY_LIMIT = 160
const PROJECT_CONTEXT_FILE_EXTENSIONS = new Set([".md", ".json", ".txt"])

function clipProjectContextText(value: string, maxLength = PROJECT_CONTEXT_SUMMARY_LIMIT): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized
}

function compareIndexedPaths(a: { path?: string }, b: { path?: string }): number {
  return (a.path ?? "").localeCompare(b.path ?? "", "zh-CN", { numeric: true })
}

function formatIndexedFile(file: IndexedBookFile): string {
  const label = file.name.replace(/\.[^.]+$/i, "")
  return `- ${label} | ${file.root || "root"} | path=${file.path}`
}

async function buildStableProjectContext(bookId: string): Promise<string> {
  const [settingCards, files] = await Promise.all([
    listIndexedSettingCards(bookId).catch(() => []),
    listIndexedFiles(bookId).catch(() => []),
  ])
  const cardPaths = new Set(settingCards.flatMap((card) => card.path ? [card.path] : []))
  const cardLines = [...settingCards]
    .sort(compareIndexedPaths)
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
    .sort(compareIndexedPaths)
    .slice(0, PROJECT_CONTEXT_FILE_LIMIT)
    .map(formatIndexedFile)

  return [
    "LG 稳定项目索引（短摘要和路径，不是完整事实）：",
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
    "- 用户要求写、续写、重写或起草章节正文时，默认在 drafts/ 创建或更新正文。",
    "- 章节正文/ 可作上下文；除非用户明确说直接写入/应用/保存到章节正文，否则不写不改 章节正文/。",
    "- 若对应草稿不存在，在 drafts/ 下用章节号/标题创建清晰的 markdown 文件。",
    "- 除非用户明确要求更新状态追踪，否则不要因起草正文而顺手改 状态追踪/；可在回复中建议状态变化。",
  ].join("\n")
}

function buildPrompt(input: {
  bookId: string
  bookTitle: string
  userMessage: string
  threadMessages: Message[]
  references: ChatReference[]
  responseConstraints: AppliedResponseConstraint[]
  skills: SkillSummary[]
  workflowAction?: WorkflowAction
}): string {
  return [
    `LG 书籍：${input.bookTitle} (${input.bookId})`,
    formatChapterDraftPolicy(),
    formatWorkflowAction(input.workflowAction),
    formatResponseConstraints(input.responseConstraints),
    formatSkillSummaries(input.skills),
    formatThreadMessages(input.threadMessages),
    "用户请求：",
    input.userMessage,
    formatReferences(input.references),
  ].filter(Boolean).join("\n")
}

const LG_LEGACY_PROMPT = `LG 集成说明：
- 除 Novel Guide 目录外，工作区可能还有旧 LG 目录。
- 人物设定/、世界观/、卷纲/、章节大纲/、章节正文/、剧情管理/、状态追踪/、读者体验/、写作约束/、章节摘要/、检查报告/ 都是一等小说材料。
- 不要因 NOVEL.md、canon/ 或 drafts/ 稀疏就判断项目缺人物、设定、大纲或正文；先查旧 LG 目录。
- 写章节前，先读相关大纲/正文，以及附近世界观、人物、冲突文件，再向用户追问基础信息。
- 生成章节正文时草稿优先：默认写 drafts/。除非用户明确要求直接应用/保存到章节正文，不写不改 章节正文/。
- 除非用户明确要求，不要因起草正文而顺手更新 状态追踪/。
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
    }
  }

  const book = await getBook(input.bookId)
  const workspacePath = getBookDir(input.bookId)
  const bookTitle = book?.title ?? input.bookId
  await initNovelWorkspace(workspacePath, bookTitle)
  const projectContext = await buildStableProjectContext(input.bookId)

  const agentSessionId = input.agentSessionId ?? input.threadId
  const baseAgentSessionId = input.baseAgentSessionId ?? agentSessionId
  const session = await loadSession(workspacePath, baseAgentSessionId)
  const promptThreadMessages = session ? [] : input.threadMessages ?? []
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: agentSessionId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    projectContext,
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
    threadMessages: promptThreadMessages,
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
      },
    }
    return
  }

  const book = await getBook(input.bookId)
  const workspacePath = getBookDir(input.bookId)
  const bookTitle = book?.title ?? input.bookId
  await initNovelWorkspace(workspacePath, bookTitle)
  const projectContext = await buildStableProjectContext(input.bookId)

  const agentSessionId = input.agentSessionId ?? input.threadId
  const baseAgentSessionId = input.baseAgentSessionId ?? agentSessionId
  const session = await loadSession(workspacePath, baseAgentSessionId)
  const promptThreadMessages = session ? [] : input.threadMessages ?? []
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: agentSessionId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
    projectContext,
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
    threadMessages: promptThreadMessages,
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
  const projectContext = await buildStableProjectContext(input.bookId)

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
          "按你的专长执行只读小说健康检查。",
          "返回要求的 JSON-in-markdown schema；尽量包含证据路径和行号。",
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
  const reply = results
    .map(({ checker, result }) => `## ${checker.label} (${checker.agent})\n\n${result.text.trim() || "未返回报告。"}`)
    .join("\n\n")
  const toolTrace = results.flatMap(({ checker, result }) =>
    result.toolTrace.length > 0 ? result.toolTrace : [`run_agent: ${checker.agent}`],
  )
  const failedTools = results.flatMap(({ result }) => result.failedTools)
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
