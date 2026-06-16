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
import {
  createSessionId,
  saveSession,
  type CompactionBoundary,
  type DroppedCompactionMessageGroup,
  type SessionCompactionState,
  type SessionState,
} from "./session.js";
import { findAgent, loadAgentsDir } from "../agents/loadAgentsDir.js";
import { loadSkillsDir } from "../skills/loadSkillsDir.js";
import { estimateMessagesTokens, estimateTextTokens } from "./tokenEstimate.js";
import { WORKSPACE_GUIDE_FILES } from "../workspace/layout.js";

const COMPACTION_PREFIX = "NG_COMPACTION_MEMO:";
const PROJECT_CONTEXT_PREFIX = "NG_PROJECT_CONTEXT:";
const USER_MEMORY_PREFIX = "NG_USER_MEMORY:";
const CHANGE_MEMO_PREFIX = "NG_CHANGE_MEMO:";
const MICROCOMPACTION_PREFIX = "NG_MICROCOMPACTED_TOOL_RESULT:";
const DEFAULT_CONTEXT_BUDGET_TOKENS = 128000;
const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.75;
const DEFAULT_MICROCOMPACTION_TRIGGER_RATIO = 0.65;
const DEFAULT_EXPECTED_OUTPUT_RESERVE_TOKENS = 4096;
const DEFAULT_RECENT_MESSAGE_COUNT = 5;
const DEFAULT_MAX_LOOPS = 32;
const DEFAULT_SUBAGENT_MAX_LOOPS = 10;
const MICROCOMPACT_MIN_TOOL_TOKENS = 600;
const MICROCOMPACT_PREVIEW_CHARS = 1200;
const MAX_COMPACTION_BOUNDARIES = 40;

export interface EngineConfig {
  cwd: string;
  client: OpenAI;
  model: string;
  sessionId?: string;
  initialMessages?: ChatCompletionMessageParam[];
  initialCompaction?: SessionCompactionState;
  appendSystemPrompt?: string;
  projectContext?: string;
  userMemoryContext?: string;
  askConfirmation?: (question: string) => Promise<boolean>;
  permissionMode?: "bypass" | "confirm";
  maxLoops?: number;
  readonlyOnly?: boolean;
  proposalOnly?: boolean;
  contextBudgetTokens?: number;
  compactionTriggerRatio?: number;
  recentMessageCount?: number;
  expectedOutputReserveTokens?: number;
}

export type EngineContextWindowLevel =
  | "normal"
  | "warning"
  | "should_compact"
  | "auto_compact"
  | "blocking";

export interface EngineContextWindowComponents {
  sessionMessages: number;
  projectContext: number;
  currentPrompt: number;
  expectedOutputReserve: number;
  total: number;
}

export interface EngineContextWindowState {
  estimatedTokens: number;
  budgetTokens: number;
  ratio: number;
  triggerRatio: number;
  level: EngineContextWindowLevel;
  reserveTokens: number;
  components: EngineContextWindowComponents;
  lastCompactedAt?: string;
}

interface ContextWindowEstimateOptions {
  projectContext?: string;
  currentPrompt?: string;
  expectedOutputReserveTokens?: number;
}

interface MicrocompactResult {
  changedMessageCount: number;
  messageIndexes: number[];
}

interface CompactionMessageGroup {
  messages: ChatCompletionMessageParam[];
  startIndex: number;
  endIndex: number;
}

interface CompactionSummaryResult {
  summary: string;
  retryCount: number;
  droppedMessageGroups: DroppedCompactionMessageGroup[];
  summarizedMessageCount: number;
  summarizedMessageRange?: { start: number; end: number };
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
    this.messages = stripRuntimeContextMessages(config.initialMessages ?? []);
    this.compaction = config.initialCompaction;
    this.tools = getTools({ readonlyOnly: config.readonlyOnly, proposalOnly: config.proposalOnly });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getMessagesSnapshot(): ChatCompletionMessageParam[] {
    return JSON.parse(JSON.stringify(this.messages)) as ChatCompletionMessageParam[];
  }

  getContextWindowState(
    messages: ChatCompletionMessageParam[] = this.messages,
    options: ContextWindowEstimateOptions = {},
  ): EngineContextWindowState {
    const budgetTokens = this.config.contextBudgetTokens ?? contextBudgetForModel(this.config.model);
    const triggerRatio = this.config.compactionTriggerRatio ?? DEFAULT_COMPACTION_TRIGGER_RATIO;
    const reserveTokens = options.expectedOutputReserveTokens
      ?? this.config.expectedOutputReserveTokens
      ?? DEFAULT_EXPECTED_OUTPUT_RESERVE_TOKENS;
    const sessionMessages = estimateMessagesTokens(messages);
    const projectContext = options.projectContext?.trim()
      ? estimateTextTokens(options.projectContext) + 8
      : 0;
    const currentPrompt = options.currentPrompt?.trim()
      ? estimateTextTokens(options.currentPrompt) + 8
      : 0;
    const components: EngineContextWindowComponents = {
      sessionMessages,
      projectContext,
      currentPrompt,
      expectedOutputReserve: reserveTokens,
      total: sessionMessages + projectContext + currentPrompt + reserveTokens,
    };
    const estimatedTokens = components.total;
    const ratio = budgetTokens > 0 ? estimatedTokens / budgetTokens : 0;
    return {
      estimatedTokens,
      budgetTokens,
      ratio,
      triggerRatio,
      level: contextWindowLevel(ratio, triggerRatio),
      reserveTokens,
      components,
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
      projectContext: this.config.projectContext,
      userMemoryContext: this.config.userMemoryContext,
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
        contextWindow: this.getContextWindowState(this.messages, { currentPrompt: prompt }),
      } };
      return;
    }

    await this.ensureSystemPrompt();
    await this.compactMessagesIfNeeded(options.signal);

    const projectContext = await this.buildProjectContext();
    const userMemoryContext = this.config.userMemoryContext?.trim() || "";
    const runtimeContextForBudget = [projectContext, userMemoryContext].filter(Boolean).join("\n\n");
    const content = options.systemMeta
      ? prompt
      : `用户请求：\n${prompt}`;
    const turnMessages: ChatCompletionMessageParam[] = [
      ...withRuntimeContexts(this.messages, projectContext, userMemoryContext),
      { role: "user", content },
    ];
    const contextWindow = this.getContextWindowState(this.messages, {
      projectContext: runtimeContextForBudget,
      currentPrompt: content,
    });

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
      stripRuntimeContextMessages(result.messages),
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
      contextWindow,
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
    const recentCount = this.config.recentMessageCount ?? DEFAULT_RECENT_MESSAGE_COUNT;
    const tokenBeforeMicrocompact = estimateMessagesTokens(this.messages);
    if (tokenBeforeMicrocompact > budget * DEFAULT_MICROCOMPACTION_TRIGGER_RATIO) {
      const microcompact = this.microcompactOldToolMessages(recentCount);
      if (microcompact.changedMessageCount > 0) {
        const createdAt = new Date().toISOString();
        this.recordCompactionBoundary({
          id: createCompactionBoundaryId("boundary"),
          createdAt,
          trigger: "auto",
          tokenBefore: tokenBeforeMicrocompact,
          tokenAfter: estimateMessagesTokens(this.messages),
          originalMessageCount: this.messages.length,
          compactedMessageCount: this.messages.length,
          compactedTurnIds: [],
          preservedRecentTurnIds: [],
          strategy: "microcompact",
          microcompactedToolResults: microcompact.changedMessageCount,
          compactedMessageRange: buildIndexRange(microcompact.messageIndexes),
        });
      }
    }

    if (estimateMessagesTokens(this.messages) <= budget * triggerRatio) return;

    const tokenBeforeFullCompaction = estimateMessagesTokens(this.messages);
    const systemMessage = this.messages[0];
    const rest = this.messages.slice(1);
    const rawMessages = rest.filter((message) => !isCompactionMemo(message) && !isChangeMemo(message));
    const targetRecentStart = Math.max(0, rawMessages.length - recentCount);
    const recentStart = findSafeRecentStart(rawMessages, targetRecentStart);
    const compactedRaw = rawMessages.slice(0, recentStart);
    const recent = rawMessages.slice(recentStart);
    if (compactedRaw.length < 4 || recent.length === 0) return;

    const compactedRawSet = new Set<ChatCompletionMessageParam>(compactedRaw);
    const compactableForSummary = rest.filter((message) =>
      isCompactionMemo(message) || isChangeMemo(message) || compactedRawSet.has(message)
    );
    const summary = await this.summarizeForCompaction(compactableForSummary, signal);
    const createdAt = new Date().toISOString();
    const memoId = createCompactionBoundaryId("memo");
    const memo: ChatCompletionMessageParam = {
      role: "system",
      content: [
        COMPACTION_PREFIX,
        `memo_id: ${memoId}`,
        `updated_at: ${createdAt}`,
        "",
        summary.summary.trim(),
      ].join("\n"),
    };
    this.messages = [systemMessage, memo, ...recent];
    this.recordCompactionBoundary({
      id: createCompactionBoundaryId("boundary"),
      createdAt,
      trigger: "auto",
      tokenBefore: tokenBeforeFullCompaction,
      tokenAfter: estimateMessagesTokens(this.messages),
      originalMessageCount: rest.length + 1,
      compactedMessageCount: this.messages.length,
      compactedTurnIds: [],
      preservedRecentTurnIds: [],
      summaryMessageId: memoId,
      strategy: "full-summary",
      compactedMessageRange: summary.summarizedMessageRange,
      preservedRecentMessageRange: recent.length > 0
        ? { start: recentStart, end: rawMessages.length - 1 }
        : undefined,
      retryCount: summary.retryCount,
      droppedMessageGroups: summary.droppedMessageGroups.length > 0
        ? summary.droppedMessageGroups
        : undefined,
    });
  }

  private microcompactOldToolMessages(recentCount: number): MicrocompactResult {
    const protectedStart = Math.max(0, this.messages.length - recentCount);
    const messageIndexes: number[] = [];
    this.messages = this.messages.map((message, index) => {
      if (index >= protectedStart || message.role !== "tool") return message;
      const content = stringifyMessageContent(message.content);
      if (!content || content.startsWith(MICROCOMPACTION_PREFIX)) return message;
      const estimatedTokens = estimateTextTokens(content);
      if (estimatedTokens < MICROCOMPACT_MIN_TOOL_TOKENS) return message;

      messageIndexes.push(index);
      return {
        ...message,
        content: buildMicrocompactedToolResult(
          content,
          estimatedTokens,
          summarizeToolMessageMetadata(message, this.messages.slice(0, index)),
        ),
      } as ChatCompletionMessageParam;
    });
    return {
      changedMessageCount: messageIndexes.length,
      messageIndexes,
    };
  }

  private recordCompactionBoundary(boundary: CompactionBoundary): void {
    const boundaries = [
      ...(this.compaction?.boundaries ?? []),
      boundary,
    ].slice(-MAX_COMPACTION_BOUNDARIES);
    this.compaction = {
      lastCompactedAt: boundary.createdAt,
      originalMessageCount: boundary.originalMessageCount,
      compactedMessageCount: boundary.compactedMessageCount,
      boundaries,
    };
  }

  private async summarizeForCompaction(
    messages: ChatCompletionMessageParam[],
    signal?: AbortSignal,
  ): Promise<CompactionSummaryResult> {
    let groups = groupMessagesForCompaction(messages);
    const droppedMessageGroups: DroppedCompactionMessageGroup[] = [];
    let retryCount = 0;

    while (groups.length > 0) {
      const rendered = renderCompactionGroups(groups, droppedMessageGroups);
      try {
        const response = await createChatCompletion({
          client: this.config.client,
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: structuredCompactionPrompt(),
            },
            { role: "user", content: rendered },
          ],
          temperature: 0.1,
          maxTokens: 3200,
          timeoutMs: 60000,
          signal,
        });
        return {
          summary: stringifyMessageContent(response.message.content) || "未生成历史上下文摘要。",
          retryCount,
          droppedMessageGroups,
          summarizedMessageCount: groups.reduce((sum, group) => sum + group.messages.length, 0),
          summarizedMessageRange: groups.length > 0
            ? { start: groups[0].startIndex, end: groups[groups.length - 1].endIndex }
            : undefined,
        };
      } catch (error) {
        if (!isPromptTooLongError(error) || groups.length <= 1) throw error;
        const dropCount = Math.max(1, Math.ceil(groups.length * 0.2));
        const dropped = groups.slice(0, Math.min(dropCount, groups.length - 1));
        droppedMessageGroups.push(...dropped.map(toDroppedCompactionMessageGroup));
        groups = groups.slice(dropped.length);
        retryCount += 1;
      }
    }

    return {
      summary: "未生成历史上下文摘要。",
      retryCount,
      droppedMessageGroups,
      summarizedMessageCount: 0,
    };
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

function contextWindowLevel(ratio: number, triggerRatio: number): EngineContextWindowLevel {
  if (ratio >= 1) return "blocking";
  if (ratio >= triggerRatio) return "auto_compact";
  if (ratio >= DEFAULT_MICROCOMPACTION_TRIGGER_RATIO) return "should_compact";
  if (ratio >= 0.5) return "warning";
  return "normal";
}

function isGeneratedSystemMessage(message: ChatCompletionMessageParam | undefined): boolean {
  if (!message || message.role !== "system") return false;
  const content = stringifyMessageContent(message.content);
  return (
    content.startsWith(PROJECT_CONTEXT_PREFIX) ||
    content.startsWith(USER_MEMORY_PREFIX) ||
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

function isUserMemoryMessage(message: ChatCompletionMessageParam): boolean {
  return message.role === "system" && stringifyMessageContent(message.content).startsWith(USER_MEMORY_PREFIX);
}

function stripRuntimeContextMessages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  return messages.filter((message) => !isProjectContextMessage(message) && !isUserMemoryMessage(message));
}

function withRuntimeContexts(
  messages: ChatCompletionMessageParam[],
  projectContext: string,
  userMemoryContext: string,
): ChatCompletionMessageParam[] {
  const cleanMessages = stripRuntimeContextMessages(messages);
  const contextMessages: ChatCompletionMessageParam[] = [];
  if (projectContext.trim()) {
    contextMessages.push({ role: "system", content: projectContext });
  }
  if (userMemoryContext.trim()) {
    contextMessages.push({
      role: "system",
      content: userMemoryContext.startsWith(USER_MEMORY_PREFIX)
        ? userMemoryContext
        : `${USER_MEMORY_PREFIX}\n${userMemoryContext}`,
    });
  }
  if (cleanMessages.length === 0) return contextMessages;
  if (isPrimarySystemMessage(cleanMessages[0])) {
    return [cleanMessages[0], ...contextMessages, ...cleanMessages.slice(1)];
  }
  return [...contextMessages, ...cleanMessages];
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

function isChangeMemo(message: ChatCompletionMessageParam): boolean {
  return message.role === "system" && stringifyMessageContent(message.content).startsWith(CHANGE_MEMO_PREFIX);
}

function createCompactionBoundaryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildIndexRange(indexes: number[]): { start: number; end: number } | undefined {
  if (indexes.length === 0) return undefined;
  return {
    start: Math.min(...indexes),
    end: Math.max(...indexes),
  };
}

interface ToolMessageMetadata {
  toolCallId?: string;
  toolName?: string;
  status: "success" | "failure" | "unknown";
  target?: string;
  argsPreview?: string;
}

function buildMicrocompactedToolResult(
  content: string,
  estimatedTokens: number,
  metadata: ToolMessageMetadata,
): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const preview = normalized.length > MICROCOMPACT_PREVIEW_CHARS
    ? `${normalized.slice(0, MICROCOMPACT_PREVIEW_CHARS).trim()}...`
    : normalized;
  return [
    MICROCOMPACTION_PREFIX,
    metadata.toolName ? `tool_name: ${metadata.toolName}` : "",
    metadata.toolCallId ? `tool_call_id: ${metadata.toolCallId}` : "",
    `status: ${metadata.status}`,
    metadata.target ? `target: ${metadata.target}` : "",
    `original_chars: ${content.length}`,
    `original_estimated_tokens: ${estimatedTokens}`,
    metadata.argsPreview ? `args_preview: ${metadata.argsPreview}` : "",
    "",
    "摘要/预览：",
    preview || "（原始工具结果为空白。）",
  ].filter((line) => line !== "").join("\n");
}

function summarizeToolMessageMetadata(
  message: ChatCompletionMessageParam,
  previousMessages: ChatCompletionMessageParam[],
): ToolMessageMetadata {
  const toolCallId = "tool_call_id" in message && typeof message.tool_call_id === "string"
    ? message.tool_call_id
    : undefined;
  const toolCall = toolCallId ? findToolCall(previousMessages, toolCallId) : null;
  const functionToolCall = toolCall && "function" in toolCall ? toolCall : null;
  const args = functionToolCall?.function?.arguments;
  const argsPreview = typeof args === "string" && args.trim()
    ? clipSingleLine(args, 360)
    : undefined;
  return {
    toolCallId,
    toolName: functionToolCall?.function?.name,
    status: inferToolResultStatus(stringifyMessageContent(message.content)),
    target: inferToolTarget(args),
    argsPreview,
  };
}

function findToolCall(previousMessages: ChatCompletionMessageParam[], toolCallId: string) {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (!("tool_calls" in message) || !Array.isArray(message.tool_calls)) continue;
    const found = message.tool_calls.find((toolCall) => toolCall.id === toolCallId);
    if (found) return found;
  }
  return null;
}

function inferToolResultStatus(content: string): ToolMessageMetadata["status"] {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (
    normalized.startsWith("error") ||
    normalized.includes("\"ok\":false") ||
    normalized.includes("\"success\":false") ||
    normalized.includes("failed") ||
    normalized.includes("失败") ||
    normalized.includes("错误")
  ) {
    return "failure";
  }
  return "success";
}

function inferToolTarget(args?: string): string | undefined {
  if (!args) return undefined;
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    for (const key of ["path", "file", "targetPath", "query", "pattern", "glob", "command"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) return clipSingleLine(value, 240);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function clipSingleLine(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars).trim()}...` : normalized;
}

function structuredCompactionPrompt(): string {
  return [
    "你正在执行长对话 checkpoint 压缩。输出给下一轮 LLM 接手使用的结构化中文 Markdown，不要编造。",
    "必须保留用户明确纠正、偏好、禁止事项、已确认事实、废弃假设、关键文件/章节/设定/角色、工具结果、未完成任务和下一步。",
    "同一事实或目标多次变化时，以用户最后一次明确拍板为准，并把早先被推翻的版本标成废弃假设。",
    "特别保留当前章节/文件目标、正在处理的路径、已经承诺但尚未完成的写入或检查。",
    "如果输入开头声明有旧消息组因 compact 请求过长被丢弃，请在“工具调用和重要结果”或“未完成任务”中明确说明信息边界。",
    "按以下 9 节输出，缺失则写“无”或“未确认”：",
    "1. 用户目标与当前任务",
    "2. 用户明确纠正 / 偏好 / 禁止事项",
    "3. 已确认事实与已废弃假设",
    "4. 文件、章节、设定、角色等关键对象",
    "5. 工具调用和重要结果",
    "6. 已完成工作",
    "7. 未完成任务",
    "8. 当前正在做什么",
    "9. 下一步",
  ].join("\n");
}

function groupMessagesForCompaction(messages: ChatCompletionMessageParam[]): CompactionMessageGroup[] {
  const groups: CompactionMessageGroup[] = [];
  let current: ChatCompletionMessageParam[] = [];
  let currentStart = 0;

  function flush(endIndex: number): void {
    if (current.length === 0) return;
    groups.push({
      messages: current,
      startIndex: currentStart,
      endIndex,
    });
    current = [];
  }

  messages.forEach((message, index) => {
    const startsNewRound = message.role === "user" || message.role === "system";
    if (startsNewRound && current.length > 0) flush(index - 1);
    if (current.length === 0) currentStart = index;
    current.push(message);
  });
  flush(messages.length - 1);

  return groups.length > 0
    ? groups
    : messages.map((message, index) => ({ messages: [message], startIndex: index, endIndex: index }));
}

function renderCompactionGroups(
  groups: CompactionMessageGroup[],
  droppedMessageGroups: DroppedCompactionMessageGroup[],
): string {
  const lines: string[] = [];
  if (droppedMessageGroups.length > 0) {
    const droppedMessages = droppedMessageGroups.reduce((sum, group) => sum + group.messageCount, 0);
    lines.push(
      "NOTICE: The oldest message groups were dropped because the compaction prompt was too long.",
      `Dropped message groups: ${droppedMessageGroups.length}; dropped messages: ${droppedMessages}`,
      "注意：更早的部分消息组因 compact 请求过长已按组丢弃，不能从当前输入恢复原文。",
      `已丢弃消息组：${droppedMessageGroups.length}；消息数：${droppedMessages}`,
      "",
    );
  }
  for (const group of groups) {
    lines.push(
      `--- message_group start=${group.startIndex} end=${group.endIndex} count=${group.messages.length} ---`,
      ...group.messages.map(renderMessageForCompaction),
      `--- /message_group end=${group.endIndex} ---`,
      "",
    );
  }
  return lines.join("\n");
}

function toDroppedCompactionMessageGroup(group: CompactionMessageGroup): DroppedCompactionMessageGroup {
  return {
    startIndex: group.startIndex,
    endIndex: group.endIndex,
    messageCount: group.messages.length,
    reason: "prompt_too_long",
    roles: [...new Set(group.messages.map((message) => "role" in message ? String(message.role) : "unknown"))],
  };
}

function isPromptTooLongError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("prompt too long") ||
    message.includes("context length") ||
    message.includes("context window") ||
    message.includes("maximum context") ||
    message.includes("too many tokens") ||
    message.includes("token limit") ||
    message.includes("request too large") ||
    (message.includes("上下文") && (message.includes("过长") || message.includes("超出"))) ||
    (message.includes("prompt") && message.includes("long"))
  );
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
