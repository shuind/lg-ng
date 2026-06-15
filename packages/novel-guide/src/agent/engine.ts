import { readFile } from "node:fs/promises";
import path from "node:path";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import fg from "fast-glob";
import { createChatCompletion, type ModelUsage } from "../model/deepseek.js";
import { buildEffectiveSystemPrompt } from "../prompts/systemPrompt.js";
import { getTools } from "../tools/registry.js";
import type { FileChange, FileProposal, ToolContext, Tools } from "../tools/tool.js";
import { queryEvents, type QueryEvent, type QueryResult } from "./query.js";
import { createSessionId, saveSession, type SessionCompactionState, type SessionState } from "./session.js";
import { findAgent, loadAgentsDir } from "../agents/loadAgentsDir.js";
import { loadSkillsDir } from "../skills/loadSkillsDir.js";
import { estimateMessagesTokens } from "./tokenEstimate.js";
import { WORKSPACE_GUIDE_FILES } from "../workspace/layout.js";

const COMPACTION_PREFIX = "NG_COMPACTION_MEMO:";
const PROJECT_CONTEXT_PREFIX = "NG_PROJECT_CONTEXT:";
const CHANGE_MEMO_PREFIX = "NG_CHANGE_MEMO:";
const DEFAULT_CONTEXT_BUDGET_TOKENS = 128000;
const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.85;
const DEFAULT_RECENT_MESSAGE_COUNT = 24;
const DEFAULT_MAX_LOOPS = 32;
const DEFAULT_SUBAGENT_MAX_LOOPS = 10;

export interface EngineConfig {
  cwd: string;
  client: OpenAI;
  model: string;
  sessionId?: string;
  initialMessages?: ChatCompletionMessageParam[];
  initialCompaction?: SessionCompactionState;
  appendSystemPrompt?: string;
  projectContext?: string;
  askConfirmation?: (question: string) => Promise<boolean>;
  permissionMode?: "bypass" | "confirm";
  maxLoops?: number;
  readonlyOnly?: boolean;
  proposalOnly?: boolean;
  contextBudgetTokens?: number;
  compactionTriggerRatio?: number;
  recentMessageCount?: number;
}

export interface EngineContextWindowState {
  estimatedTokens: number;
  budgetTokens: number;
  ratio: number;
  triggerRatio: number;
  lastCompactedAt?: string;
}

export interface EngineTurnResult {
  text: string;
  messages: ChatCompletionMessageParam[];
  toolTrace: string[];
  failedTools: string[];
  fileChanges: FileChange[];
  proposals: FileProposal[];
  usage: ModelUsage;
  sessionId: string;
  contextWindow: EngineContextWindowState;
}

export interface EngineSubAgentInput {
  agent: string;
  prompt: string;
  readonly?: boolean;
}

export interface PolishHandoffOptions {
  profile: string;
  chapter: string;
  target: string;
}

export interface EngineSubmitOptions {
  save?: boolean;
  systemMeta?: boolean;
  signal?: AbortSignal;
}

export type EngineStreamEvent =
  | { type: "query_event"; event: QueryEvent }
  | { type: "done"; result: EngineTurnResult };

export class AgentEngine {
  private messages: ChatCompletionMessageParam[];
  private readonly sessionId: string;
  private readonly tools: Tools;
  private compaction?: SessionCompactionState;

  constructor(private readonly config: EngineConfig) {
    this.sessionId = config.sessionId ?? createSessionId();
    this.messages = stripProjectContextMessages(config.initialMessages ?? []);
    this.compaction = config.initialCompaction;
    this.tools = getTools({ readonlyOnly: config.readonlyOnly, proposalOnly: config.proposalOnly });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getMessagesSnapshot(): ChatCompletionMessageParam[] {
    return JSON.parse(JSON.stringify(this.messages)) as ChatCompletionMessageParam[];
  }

  getContextWindowState(messages: ChatCompletionMessageParam[] = this.messages): EngineContextWindowState {
    const budgetTokens = this.config.contextBudgetTokens ?? contextBudgetForModel(this.config.model);
    const estimatedTokens = estimateMessagesTokens(messages);
    return {
      estimatedTokens,
      budgetTokens,
      ratio: budgetTokens > 0 ? estimatedTokens / budgetTokens : 0,
      triggerRatio: this.config.compactionTriggerRatio ?? DEFAULT_COMPACTION_TRIGGER_RATIO,
      lastCompactedAt: this.compaction?.lastCompactedAt,
    };
  }

  private async buildProjectContext(): Promise<string> {
    const [skills, agents, memoryCard] = await Promise.all([
      loadSkillsDir(this.config.cwd),
      loadAgentsDir(this.config.cwd),
      this.config.projectContext?.trim() || buildProjectMemoryCard(this.config.cwd),
    ]);
    const skillSummary = skills
      .filter((skill) => !skill.disableModelInvocation)
      .map((skill) => `- ${skill.name}: ${skill.description}${skill.whenToUse ? `；何时用：${skill.whenToUse}` : ""}`)
      .join("\n");
    const agentSummary = agents
      .map((agent) => `- ${agent.name}: ${agent.description}`)
      .join("\n");
    return [
      PROJECT_CONTEXT_PREFIX,
      `工作区：${this.config.cwd}`,
      "项目事实以文件为准。下方只是导航索引，不是完整真相；涉及具体人物、设定、章节、正文、伏笔或规则时，先用 read_file 读取对应路径再判断或修改。",
      memoryCard,
      skillSummary ? `可用技能：\n${skillSummary}` : "可用技能：无",
      agentSummary ? `可用子智能体：\n${agentSummary}` : "可用子智能体：无",
    ].join("\n\n");
  }

  private createToolContext(permissionCache: Map<string, boolean>, signal?: AbortSignal): ToolContext {
    return {
      cwd: this.config.cwd,
      signal,
      permissionMode: this.config.permissionMode ?? "bypass",
      askConfirmation: this.config.askConfirmation,
      permissionCache,
      runAgent: async ({ agent, prompt, readonly }) => {
        const result = await this.runSubAgent({ agent, prompt, readonly });
        return result.text;
      },
    };
  }

  async runSubAgent(input: EngineSubAgentInput): Promise<EngineTurnResult> {
    const agent = await findAgent(this.config.cwd, input.agent);
    if (!agent) throw new Error(`Agent not found: ${input.agent}`);

    const subEngine = new AgentEngine({
      cwd: this.config.cwd,
      client: this.config.client,
      model: this.config.model,
      askConfirmation: this.config.askConfirmation,
      permissionMode: this.config.permissionMode,
      maxLoops: Math.min(this.config.maxLoops ?? DEFAULT_MAX_LOOPS, DEFAULT_SUBAGENT_MAX_LOOPS),
      readonlyOnly: input.readonly === true,
      appendSystemPrompt: `你正在作为子智能体 ${agent.name} 运行。默认拥有完整工具权限；如果任务要求只读，不要改文件。`,
    });
    return await subEngine.submitMessage(`${agent.prompt}\n\n# 任务\n${input.prompt}`, {
      save: false,
      systemMeta: true,
    });
  }

  async runReadonlySubAgent(input: { agent: string; prompt: string }): Promise<string> {
    const result = await this.runSubAgent({
      agent: input.agent,
      prompt: input.prompt,
      readonly: true,
    });
    return result.text;
  }

  async polishHandoffDraft(draft: string, options: PolishHandoffOptions): Promise<string> {
    const response = await createChatCompletion({
      client: this.config.client,
      model: this.config.model,
      messages: [
        {
          role: "system",
          content: [
            "你在轻收敛一份小说项目 handoff。",
            "只允许整理结构、合并重复、补清晰小标题、压缩冗余。",
            "禁止新增事实、剧情、设定、人物关系、伏笔、章节正文或风格承诺。",
            "如果原稿信息不足，保留缺失项和最小追问；不要替作者补。",
            "输出中文 Markdown，保留文件路径和 profile/mode 元信息。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `profile: ${options.profile}`,
            `chapter: ${options.chapter}`,
            `target: ${options.target}`,
            "",
            draft.slice(0, 80_000),
          ].join("\n"),
        },
      ],
      temperature: 0.1,
      maxTokens: 2200,
      timeoutMs: 60000,
    });
    return stringifyMessageContent(response.message.content) || draft;
  }

  async submitMessage(
    prompt: string,
    options: EngineSubmitOptions = {},
  ): Promise<EngineTurnResult> {
    let finalResult: EngineTurnResult | null = null;
    for await (const event of this.submitMessageEvents(prompt, options)) {
      if (event.type === "done") finalResult = event.result;
    }
    if (finalResult) return finalResult;

    return {
      text: "查询结束但没有最终结果。",
      messages: this.messages,
      toolTrace: [],
      failedTools: ["engine: 查询结束但没有最终结果。"],
      fileChanges: [],
      proposals: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      sessionId: this.sessionId,
      contextWindow: this.getContextWindowState(),
    };
  }

  async *submitMessageEvents(
    prompt: string,
    options: EngineSubmitOptions = {},
  ): AsyncGenerator<EngineStreamEvent> {
    const simpleReply = this.trySimpleLocalReply(prompt);
    if (simpleReply) {
      yield { type: "done", result: {
        text: simpleReply,
        messages: this.messages,
        toolTrace: [],
        failedTools: [],
        fileChanges: [],
        proposals: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        sessionId: this.sessionId,
        contextWindow: this.getContextWindowState(),
      } };
      return;
    }

    await this.ensureSystemPrompt();
    await this.compactMessagesIfNeeded(options.signal);

    const projectContext = await this.buildProjectContext();
    const content = options.systemMeta
      ? prompt
      : `用户请求：\n${prompt}`;
    const turnMessages: ChatCompletionMessageParam[] = [
      ...withProjectContext(this.messages, projectContext),
      { role: "user", content },
    ];

    let result: QueryResult | null = null;
    for await (const event of queryEvents({
      client: this.config.client,
      model: this.config.model,
      messages: turnMessages,
      tools: this.tools,
      toolContext: this.createToolContext(new Map(), options.signal),
      maxLoops: this.config.maxLoops ?? DEFAULT_MAX_LOOPS,
      signal: options.signal,
    })) {
      if (event.type === "done") result = event.result;
      else yield { type: "query_event", event };
    }

    if (!result) {
      result = {
        messages: this.messages,
        text: "查询结束但没有最终结果。",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        toolTrace: [],
        failedTools: ["engine: 查询结束但没有最终结果。"],
        fileChanges: [],
        proposals: [],
      };
    }
    this.messages = appendChangeMemo(
      stripProjectContextMessages(result.messages),
      buildChangeMemo(result.fileChanges, result.proposals),
    );

    if (options.save !== false) {
      const state: SessionState = {
        id: this.sessionId,
        cwd: this.config.cwd,
        messages: this.messages,
        compaction: this.compaction,
        updatedAt: new Date().toISOString(),
      };
      await saveSession(state);
    }

    yield { type: "done", result: {
      text: result.text,
      messages: this.messages,
      toolTrace: result.toolTrace,
      failedTools: result.failedTools,
      fileChanges: result.fileChanges,
      proposals: result.proposals,
      usage: result.usage,
      sessionId: this.sessionId,
      contextWindow: this.getContextWindowState(),
    } };
  }

  private async ensureSystemPrompt(): Promise<void> {
    if (isPrimarySystemMessage(this.messages[0])) return;
    const systemPrompt = await buildEffectiveSystemPrompt({
      cwd: this.config.cwd,
      appendSystemPrompt: this.config.appendSystemPrompt,
    });
    this.messages.unshift({ role: "system", content: systemPrompt });
  }

  private async compactMessagesIfNeeded(signal?: AbortSignal): Promise<void> {
    if (this.messages.length <= 1) return;

    const budget = this.config.contextBudgetTokens ?? contextBudgetForModel(this.config.model);
    const triggerRatio = this.config.compactionTriggerRatio ?? DEFAULT_COMPACTION_TRIGGER_RATIO;
    if (estimateMessagesTokens(this.messages) <= budget * triggerRatio) return;

    const systemMessage = this.messages[0];
    const rest = this.messages.slice(1);
    const existingMemos = rest.filter(isCompactionMemo);
    const compactableMessages = rest.filter((message) => !isCompactionMemo(message));
    const recentCount = this.config.recentMessageCount ?? DEFAULT_RECENT_MESSAGE_COUNT;
    const targetRecentStart = Math.max(0, compactableMessages.length - recentCount);
    const recentStart = findSafeRecentStart(compactableMessages, targetRecentStart);
    const compacted = compactableMessages.slice(0, recentStart);
    const recent = compactableMessages.slice(recentStart);
    if (compacted.length < 4 || recent.length === 0) return;

    const summary = await this.summarizeForCompaction(compacted, signal);
    const memo: ChatCompletionMessageParam = {
      role: "system",
      content: [
        COMPACTION_PREFIX,
        `updated_at: ${new Date().toISOString()}`,
        "",
        summary.trim(),
      ].join("\n"),
    };
    this.messages = [systemMessage, ...existingMemos, memo, ...recent];
    this.compaction = {
      lastCompactedAt: new Date().toISOString(),
      originalMessageCount: rest.length + 1,
      compactedMessageCount: this.messages.length,
    };
  }

  private async summarizeForCompaction(
    messages: ChatCompletionMessageParam[],
    signal?: AbortSignal,
  ): Promise<string> {
    const rendered = messages.map(renderMessageForCompaction).join("\n\n").slice(0, 120_000);
    const response = await createChatCompletion({
      client: this.config.client,
      model: this.config.model,
      messages: [
        {
          role: "system",
          content: "为后续连续性总结此前工作区智能体对话。保留用户目标、决策、文件路径、工具结果、未解决任务和重要约束；不要编造。",
        },
        { role: "user", content: rendered },
      ],
      temperature: 0.1,
      maxTokens: 1400,
      timeoutMs: 60000,
      signal,
    });
    return stringifyMessageContent(response.message.content) || "未生成历史上下文摘要。";
  }

  private trySimpleLocalReply(prompt: string): string | null {
    const normalized = prompt.trim().toLowerCase();
    if (["你好", "hi", "hello", "嗨"].includes(normalized)) {
      return "你好，我是 Novel Guide。你可以让我阅读项目文件、检查章节、分拣外部材料，或运行 /novel-init 初始化小说工作区。";
    }
    return null;
  }
}

function contextBudgetForModel(model: string): number {
  const normalized = model.toLowerCase();
  if (normalized.includes("mimo")) return 128000;
  if (normalized.includes("deepseek")) return 128000;
  return DEFAULT_CONTEXT_BUDGET_TOKENS;
}

function isGeneratedSystemMessage(message: ChatCompletionMessageParam | undefined): boolean {
  if (!message || message.role !== "system") return false;
  const content = stringifyMessageContent(message.content);
  return (
    content.startsWith(PROJECT_CONTEXT_PREFIX) ||
    content.startsWith(COMPACTION_PREFIX) ||
    content.startsWith(CHANGE_MEMO_PREFIX)
  );
}

function isPrimarySystemMessage(message: ChatCompletionMessageParam | undefined): boolean {
  return Boolean(message && message.role === "system" && !isGeneratedSystemMessage(message));
}

function isProjectContextMessage(message: ChatCompletionMessageParam): boolean {
  return message.role === "system" && stringifyMessageContent(message.content).startsWith(PROJECT_CONTEXT_PREFIX);
}

function stripProjectContextMessages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  return messages.filter((message) => !isProjectContextMessage(message));
}

function withProjectContext(
  messages: ChatCompletionMessageParam[],
  projectContext: string,
): ChatCompletionMessageParam[] {
  const cleanMessages = stripProjectContextMessages(messages);
  const contextMessage: ChatCompletionMessageParam = { role: "system", content: projectContext };
  if (cleanMessages.length === 0) return [contextMessage];
  if (isPrimarySystemMessage(cleanMessages[0])) {
    return [cleanMessages[0], contextMessage, ...cleanMessages.slice(1)];
  }
  return [contextMessage, ...cleanMessages];
}

function buildChangeMemo(
  fileChanges: FileChange[],
  proposals: FileProposal[],
): ChatCompletionMessageParam | null {
  const lines: string[] = [];
  const seenChanges = new Set<string>();
  for (const change of fileChanges) {
    if (!change.path || seenChanges.has(change.path)) continue;
    seenChanges.add(change.path);
    const charCount = change.charCount ?? change.afterContent?.length ?? 0;
    lines.push(`- ${change.operation} ${change.path} (${charCount} 字符)`);
  }

  const seenProposals = new Set<string>();
  for (const proposal of proposals) {
    if (!proposal.path || seenProposals.has(proposal.path)) continue;
    seenProposals.add(proposal.path);
    lines.push(`- 改动提案 ${proposal.path} (${proposal.afterContent.length} 字符)`);
  }

  if (lines.length === 0) return null;
  const visible = lines.slice(0, 20);
  if (lines.length > visible.length) visible.push(`- 另有 ${lines.length - visible.length} 项变更省略`);
  return {
    role: "system",
    content: [
      CHANGE_MEMO_PREFIX,
      `updated_at: ${new Date().toISOString()}`,
      "",
      "上一轮助手已完成的工作区变更：",
      ...visible,
    ].join("\n"),
  };
}

function appendChangeMemo(
  messages: ChatCompletionMessageParam[],
  memo: ChatCompletionMessageParam | null,
): ChatCompletionMessageParam[] {
  return memo ? [...messages, memo] : messages;
}

async function buildProjectMemoryCard(cwd: string): Promise<string> {
  const [novel, legacyMaterialIndex] = await Promise.all([
    readWorkspaceFile(cwd, "NOVEL.md"),
    summarizeLegacyLgMaterials(cwd),
  ]);
  if (!novel) return legacyMaterialIndex || "项目记忆：未找到 NOVEL.md。";

  const sections = [
    extractMarkdownSection(novel, "核心实体清单", 1200),
    extractMarkdownSection(novel, "当前 open 伏笔", 1200),
    extractMarkdownSection(novel, "待确认问题", 800),
  ].filter(Boolean);
  const canonFacts = await summarizeCanonFacts(cwd);
  const body = [
    "项目索引（来自文件，不是 LLM 摘要）：",
    sections.length > 0 ? sections.join("\n\n") : "NOVEL.md 暂无长期记忆内容。",
    canonFacts,
    legacyMaterialIndex,
  ].filter(Boolean);
  return body.join("\n\n");
}

async function readWorkspaceFile(cwd: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(cwd, relativePath), "utf8");
  } catch {
    return null;
  }
}

function extractMarkdownSection(markdown: string, heading: string, maxChars: number): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const content = lines.slice(start + 1, end).join("\n").trim();
  if (!content) return "";
  return `## ${heading}\n${content.slice(0, maxChars)}`;
}

async function summarizeCanonFacts(cwd: string): Promise<string> {
  const files = await fg(["canon/**/*.md"], {
    cwd,
    onlyFiles: true,
    dot: false,
    ignore: ["**/.gitkeep"],
  }).catch(() => []);
  if (files.length === 0) return "";

  const lines: string[] = [];
  for (const file of files.slice(0, 40)) {
    const raw = await readWorkspaceFile(cwd, file);
    if (!raw) continue;
    const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || file.replace(/^.*\//, "").replace(/\.md$/i, "");
    const aliases = extractAliases(raw);
    lines.push(`- ${title}${aliases.length ? `（别名：${aliases.join(", ")}）` : ""} -> ${file}`);
  }
  return lines.length ? `正典索引：\n${lines.join("\n")}` : "";
}

const LEGACY_LG_MATERIAL_PATTERNS = [
  "创作指南.md",
  ...WORKSPACE_GUIDE_FILES,
  "人物设定/**/*.md",
  "世界观/**/*.md",
  "卷纲/**/*.md",
  "章节大纲/**/*.md",
  "章节正文/**/*.md",
  "剧情管理/**/*.md",
  "状态追踪/**/*.md",
  "读者体验/**/*.md",
  "写作约束/**/*.md",
  "章节摘要/**/*.md",
  "检查报告/**/*.md",
  "skills/**/*.md",
  "skills/**/*.json",
];

async function summarizeLegacyLgMaterials(cwd: string): Promise<string> {
  const files = await fg(LEGACY_LG_MATERIAL_PATTERNS, {
    cwd,
    onlyFiles: true,
    dot: false,
    ignore: ["**/.gitkeep"],
  }).catch(() => []);
  if (files.length === 0) return "";

  const lines: string[] = [];
  for (const file of files.sort((a, b) => a.localeCompare(b, "zh-CN")).slice(0, 80)) {
    const raw = await readWorkspaceFile(cwd, file);
    if (!raw) continue;
    const summary = summarizeMaterialFile(file, raw);
    if (summary) lines.push(`- ${summary} | path=${file}`);
  }
  return lines.length ? `LG 旧素材索引：\n${lines.join("\n")}` : "";
}

function summarizeMaterialFile(file: string, content: string): string {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
    || file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/i, "");
  const excerpt = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("---"))
    .filter((line) => !isPlaceholderLine(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 140);
  return excerpt ? `${title}: ${excerpt}` : title;
}

function isPlaceholderLine(line: string): boolean {
  return (
    line.includes("TODO") ||
    line.includes("待补充") ||
    line.includes("请在此写下") ||
    line.includes("记录主线剧情") ||
    line.includes("记录各支线剧情") ||
    line.includes("记录所有已埋设") ||
    line.includes("记录推动剧情") ||
    line.includes("按故事内时间记录") ||
    line.includes("追踪各角色") ||
    line.includes("记录当前章节") ||
    line.includes("记录各章节") ||
    line.includes("追踪读者与角色") ||
    line.includes("记录对读者") ||
    line.includes("记录已承诺") ||
    line.includes("记录写作中") ||
    line.includes("记录本作品类型") ||
    line.includes("记录写作质量")
  );
}

function extractAliases(content: string): string[] {
  const aliases: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:aliases?|别名|又名|\*\*(?:aliases?|别名|又名)\*\*)\s*[:：]?\s*(.+)$/i);
    if (!match?.[1]) continue;
    aliases.push(...match[1].split(/[、,，;；|/]/).map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(aliases)].slice(0, 8);
}

function findSafeRecentStart(messages: ChatCompletionMessageParam[], targetStart: number): number {
  let start = Math.max(0, Math.min(messages.length, targetStart));
  while (start > 0 && messages[start]?.role === "tool") {
    start -= 1;
  }
  return start;
}

function isCompactionMemo(message: ChatCompletionMessageParam): boolean {
  return message.role === "system" && stringifyMessageContent(message.content).startsWith(COMPACTION_PREFIX);
}

function renderMessageForCompaction(message: ChatCompletionMessageParam): string {
  const role = "role" in message ? message.role : "unknown";
  const content = stringifyMessageContent(message.content);
  const toolCalls = "tool_calls" in message && message.tool_calls
    ? `\nTool calls: ${JSON.stringify(message.tool_calls)}`
    : "";
  return `[${role}]\n${content}${toolCalls}`;
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
      return part.text;
    }
    return JSON.stringify(part);
  }).join("");
}
