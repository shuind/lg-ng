import {
  AgentEngine,
  createOpenAICompatibleClient,
  type EngineStreamEvent,
  type FileChange,
  type FileProposal,
  getOpenAICompatibleConfig,
  initNovelWorkspace,
  loadSession,
} from "novel-guide"
import { getBook } from "@/lib/server/book-store"
import { getBookDir } from "@/lib/server/paths"
import type { AppliedResponseConstraint, SettingCard, SkillSummary, WorkflowAction } from "@/lib/types"

export interface NovelGuideAgentResult {
  reply: string
  sessionId: string
  toolTrace: string[]
  failedTools: string[]
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  workspacePath: string
  fileChanges: FileChange[]
  proposals: FileProposal[]
}

export interface NovelGuideReviewResult {
  reply: string
  sessionId: string
  toolTrace: string[]
  failedTools: string[]
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  workspacePath: string
}

export type NovelGuideAgentStreamEvent =
  | { type: "engine_event"; event: EngineStreamEvent }
  | { type: "done"; result: NovelGuideAgentResult }

function formatReferences(references: SettingCard[]): string {
  if (references.length === 0) return ""
  const lines = references.map((card) => {
    const path = card.path ? ` path=${card.path}` : ""
    return `- ${card.name} (${card.category})${path}`
  })
  return `\n\nLG selected references:\n${lines.join("\n")}`
}

function formatResponseConstraints(responseConstraints: AppliedResponseConstraint[]): string {
  if (responseConstraints.length === 0) return ""
  const lines = responseConstraints.map((constraint) => {
    const source = constraint.source === "temporary" ? "temporary" : "library"
    return `- [${source}] ${constraint.title}: ${constraint.instruction}`
  })
  return [
    "Response constraints:",
    "These constraints only control the final reply's wording, tone, and output boundaries.",
    "They do not change file read/write abilities, tool permissions, or what task work may be performed.",
    "If the current user request directly conflicts with a constraint, follow the current user request. Otherwise, strictly follow all enabled constraints.",
    ...lines,
  ].join("\n")
}

function formatSkillSummaries(skills: SkillSummary[]): string {
  if (skills.length === 0) return ""
  const lines = skills.flatMap(({ skill, summary }) => [
    `- ${skill.name ?? skill.id} (${skill.type}) source=${skill.sourceFile} summary=${skill.summaryFile ?? "none"}`,
    summary.trim() ? summary.trim() : "  （摘要为空。必要时先读取源文件。）",
  ])
  return [
    "Selected writing skills:",
    "Use these reusable writing rules as high-priority context for this turn.",
    ...lines,
  ].join("\n")
}

function formatWorkflowAction(action?: WorkflowAction): string {
  if (!action) return ""
  const instructions: Record<WorkflowAction, string> = {
    continue: "Workflow action /续写: use propose_file_change to create a reviewable continuation proposal for the target draft/chapter. Do not write target files directly.",
    revise: "Workflow action /改稿: use propose_file_change to create a concrete diff proposal. Prefer minimal edits and do not write target files directly.",
    plant: "Workflow action /铺垫: plant an open foreshadowing hook and maintain NOVEL.md's 当前 open 伏笔 when writing is requested.",
    resolve: "Workflow action /收线: inspect open foreshadowing hooks, choose the referenced hook, and check the payoff is self-consistent before writing.",
    diagnose: "Workflow action /卡点诊断: read context and provide multiple next directions. This is readonly unless the user explicitly asks to write.",
    plan: "Workflow action /计划: produce a chapter/action plan first. Do not write files in this turn unless the user explicitly asks to execute the plan.",
  }
  return `Selected workflow:\n${instructions[action]}`
}

function isProposalWorkflow(action?: WorkflowAction): boolean {
  return action === "continue" || action === "revise"
}

function buildPrompt(input: {
  bookId: string
  bookTitle: string
  userMessage: string
  references: SettingCard[]
  responseConstraints: AppliedResponseConstraint[]
  skills: SkillSummary[]
  workflowAction?: WorkflowAction
}): string {
  return [
    `LG book: ${input.bookTitle} (${input.bookId})`,
    formatWorkflowAction(input.workflowAction),
    formatResponseConstraints(input.responseConstraints),
    formatSkillSummaries(input.skills),
    "User request:",
    input.userMessage,
    formatReferences(input.references),
  ].filter(Boolean).join("\n")
}

const LG_LEGACY_PROMPT = `LG integration notes:
- This workspace may contain legacy LG directories in addition to Novel Guide directories.
- Treat 人物设定/, 世界观/, 卷纲/, 章节大纲/, 章节正文/, 剧情管理/, 状态追踪/, 读者体验/, 写作约束/, 章节摘要/, and 检查报告/ as first-class novel material.
- Prefer reading the real files before answering. If you write files, use the workspace tools and report what changed.
- The surrounding LG UI stores chat turns separately; do not try to edit thread-messages.jsonl unless the user explicitly asks.`

export async function runNovelGuideAgent(input: {
  bookId: string
  userMessage: string
  references?: SettingCard[]
  responseConstraints?: AppliedResponseConstraint[]
  skills?: SkillSummary[]
  threadId: string
  signal?: AbortSignal
  readonlyOnly?: boolean
  workflowAction?: WorkflowAction
}): Promise<NovelGuideAgentResult> {
  const config = getOpenAICompatibleConfig()
  if (!config) {
    return {
      reply: "Novel Guide 还没有配置模型。请设置 DEEPSEEK_API_KEY，或设置 LLM_PROVIDER=mimo 并提供 MIMO_API_KEY。",
      sessionId: input.threadId,
      toolTrace: [],
      failedTools: ["model_config: missing API key"],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          workspacePath: getBookDir(input.bookId),
          fileChanges: [],
          proposals: [],
    }
  }

  const book = await getBook(input.bookId)
  const workspacePath = getBookDir(input.bookId)
  const bookTitle = book?.title ?? input.bookId
  await initNovelWorkspace(workspacePath, bookTitle)

  const session = await loadSession(workspacePath, input.threadId)
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: input.threadId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
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
    workflowAction: input.workflowAction,
  }), { signal: input.signal })

  return {
    reply: result.text,
    sessionId: result.sessionId,
    toolTrace: result.toolTrace,
    failedTools: result.failedTools,
    usage: result.usage,
    workspacePath,
    fileChanges: result.fileChanges,
    proposals: result.proposals,
  }
}

export async function* runNovelGuideAgentStream(input: {
  bookId: string
  userMessage: string
  references?: SettingCard[]
  responseConstraints?: AppliedResponseConstraint[]
  skills?: SkillSummary[]
  threadId: string
  signal?: AbortSignal
  readonlyOnly?: boolean
  workflowAction?: WorkflowAction
}): AsyncGenerator<NovelGuideAgentStreamEvent> {
  const config = getOpenAICompatibleConfig()
  if (!config) {
    yield {
      type: "done",
      result: {
        reply: "Novel Guide 还没有配置模型。请设置 DEEPSEEK_API_KEY，或设置 LLM_PROVIDER=mimo 并提供 MIMO_API_KEY。",
        sessionId: input.threadId,
        toolTrace: [],
        failedTools: ["model_config: missing API key"],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
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

  const session = await loadSession(workspacePath, input.threadId)
  const engine = new AgentEngine({
    cwd: workspacePath,
    client: createOpenAICompatibleClient(config),
    model: config.model,
    sessionId: input.threadId,
    initialMessages: session?.messages,
    initialCompaction: session?.compaction,
    appendSystemPrompt: LG_LEGACY_PROMPT,
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
    workflowAction: input.workflowAction,
  }), { signal: input.signal })) {
    if (event.type !== "done") {
      yield { type: "engine_event", event }
      continue
    }
    yield {
      type: "done",
      result: {
        reply: event.result.text,
        sessionId: event.result.sessionId,
        toolTrace: event.result.toolTrace,
        failedTools: event.result.failedTools,
        usage: event.result.usage,
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
  const config = getOpenAICompatibleConfig()
  if (!config) {
    return {
      reply: "Novel Guide 还没有配置模型。请设置 DEEPSEEK_API_KEY，或设置 LLM_PROVIDER=mimo 并提供 MIMO_API_KEY。",
      sessionId: input.threadId,
      toolTrace: [],
      failedTools: ["model_config: missing API key"],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
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
          `Book: ${bookTitle} (${input.bookId})`,
          `Review scope: ${scope}`,
          "",
          "Run a read-only novel health check for your specialty.",
          "Return the required JSON-in-markdown schema. Include evidence paths and line numbers when possible.",
          "Do not modify files.",
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

  return {
    reply,
    sessionId: input.threadId,
    toolTrace,
    failedTools,
    usage,
    workspacePath,
  }
}
