import {
  AgentEngine,
  createOpenAICompatibleClient,
  type FileChange,
  getOpenAICompatibleConfig,
  initNovelWorkspace,
  loadSession,
} from "novel-guide"
import { getBook } from "@/lib/server/book-store"
import { getBookDir } from "@/lib/server/paths"
import type { AppliedResponseConstraint, SettingCard, SkillSummary } from "@/lib/types"

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

function buildPrompt(input: {
  bookId: string
  bookTitle: string
  userMessage: string
  references: SettingCard[]
  responseConstraints: AppliedResponseConstraint[]
  skills: SkillSummary[]
}): string {
  return [
    `LG book: ${input.bookTitle} (${input.bookId})`,
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
    appendSystemPrompt: LG_LEGACY_PROMPT,
    permissionMode: "bypass",
  })

  const result = await engine.submitMessage(buildPrompt({
    bookId: input.bookId,
    bookTitle,
    userMessage: input.userMessage,
    references: input.references ?? [],
    responseConstraints: input.responseConstraints ?? [],
    skills: input.skills ?? [],
  }))

  return {
    reply: result.text,
    sessionId: result.sessionId,
    toolTrace: result.toolTrace,
    failedTools: result.failedTools,
    usage: result.usage,
    workspacePath,
    fileChanges: result.fileChanges,
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
    maxLoops: 5,
  })

  const scope = input.scope?.trim() || "全书当前项目"
  const result = await engine.runSubAgent({
    agent: "continuity-checker",
    readonly: true,
    prompt: [
      `Book: ${bookTitle} (${input.bookId})`,
      `Review scope: ${scope}`,
      "",
      "Run a read-only novel health check. Focus on:",
      "- overdue or unresolved foreshadowing",
      "- timeline ordering problems",
      "- impossible character locations",
      "- relationship graph inconsistencies",
      "- POV boundary issues",
      "",
      "Return Markdown with these sections: 摘要, 高风险问题, 证据, 建议下一步.",
      "Do not modify files.",
    ].join("\n"),
  })

  return {
    reply: result.text,
    sessionId: result.sessionId,
    toolTrace: result.toolTrace,
    failedTools: result.failedTools,
    usage: result.usage,
    workspacePath,
  }
}
