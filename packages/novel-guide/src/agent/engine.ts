// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/QueryEngine.ts
// Mechanism copied: one engine per conversation; messages persist across
// turns; submitMessage builds context, invokes query(), accumulates usage, and
// writes session state.

import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createChatCompletion } from "../model/deepseek.js";
import { buildEffectiveSystemPrompt } from "../prompts/systemPrompt.js";
import { getTools } from "../tools/registry.js";
import type { FileChange, ToolContext, Tools } from "../tools/tool.js";
import { queryEvents, type QueryEvent, type QueryResult } from "./query.js";
import { createSessionId, saveSession, type SessionCompactionState, type SessionState } from "./session.js";
import { findAgent, loadAgentsDir } from "../agents/loadAgentsDir.js";
import { loadSkillsDir } from "../skills/loadSkillsDir.js";

const COMPACTION_PREFIX = "NG_COMPACTION_MEMO:";
const DEFAULT_CONTEXT_BUDGET_TOKENS = 24000;
const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.8;
const DEFAULT_RECENT_MESSAGE_COUNT = 16;

export interface EngineConfig {
  cwd: string;
  client: OpenAI;
  model: string;
  sessionId?: string;
  initialMessages?: ChatCompletionMessageParam[];
  initialCompaction?: SessionCompactionState;
  appendSystemPrompt?: string;
  askConfirmation?: (question: string) => Promise<boolean>;
  permissionMode?: "bypass" | "confirm";
  maxLoops?: number;
  readonlyOnly?: boolean;
  contextBudgetTokens?: number;
  compactionTriggerRatio?: number;
  recentMessageCount?: number;
}

export interface EngineTurnResult {
  text: string;
  messages: ChatCompletionMessageParam[];
  toolTrace: string[];
  failedTools: string[];
  fileChanges: FileChange[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  sessionId: string;
}

export interface EngineSubAgentInput {
  agent: string;
  prompt: string;
  readonly?: boolean;
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
    this.messages = config.initialMessages ?? [];
    this.compaction = config.initialCompaction;
    this.tools = getTools({ readonlyOnly: config.readonlyOnly });
  }

  private async buildUserContext(): Promise<string> {
    const [skills, agents] = await Promise.all([
      loadSkillsDir(this.config.cwd),
      loadAgentsDir(this.config.cwd),
    ]);
    const skillSummary = skills
      .filter((skill) => !skill.disableModelInvocation)
      .map((skill) => `- ${skill.name}: ${skill.description}${skill.whenToUse ? ` when: ${skill.whenToUse}` : ""}`)
      .join("\n");
    const agentSummary = agents
      .map((agent) => `- ${agent.name}: ${agent.description}`)
      .join("\n");
    return [
      `Workspace: ${this.config.cwd}`,
      skillSummary ? `Available skills:\n${skillSummary}` : "Available skills: none",
      agentSummary ? `Available agents:\n${agentSummary}` : "Available agents: none",
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
      maxLoops: Math.min(this.config.maxLoops ?? 8, 5),
      readonlyOnly: input.readonly !== false,
      appendSystemPrompt: `You are running as subagent: ${agent.name}. Return a structured report. Do not modify files unless explicitly allowed.`,
    });
    return await subEngine.submitMessage(`${agent.prompt}\n\n# Task\n${input.prompt}`, {
      save: false,
      systemMeta: true,
    });
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
      text: "Query ended without a final result.",
      messages: this.messages,
      toolTrace: [],
      failedTools: ["engine: Query ended without a final result."],
      fileChanges: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      sessionId: this.sessionId,
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
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        sessionId: this.sessionId,
      } };
      return;
    }

    await this.ensureSystemPrompt();
    await this.compactMessagesIfNeeded(options.signal);

    const userContext = await this.buildUserContext();
    const content = options.systemMeta
      ? `${userContext}\n\n${prompt}`
      : `${userContext}\n\nUser request:\n${prompt}`;
    const turnMessages: ChatCompletionMessageParam[] = [
      ...this.messages,
      { role: "user", content },
    ];

    let result: QueryResult | null = null;
    for await (const event of queryEvents({
      client: this.config.client,
      model: this.config.model,
      messages: turnMessages,
      tools: this.tools,
      toolContext: this.createToolContext(new Map(), options.signal),
      maxLoops: this.config.maxLoops ?? 8,
      signal: options.signal,
    })) {
      if (event.type === "done") result = event.result;
      else yield { type: "query_event", event };
    }

    if (!result) {
      result = {
        messages: this.messages,
        text: "Query ended without a final result.",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        toolTrace: [],
        failedTools: ["engine: Query ended without a final result."],
        fileChanges: [],
      };
    }
    this.messages = result.messages;

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
      usage: result.usage,
      sessionId: this.sessionId,
    } };
  }

  private async ensureSystemPrompt(): Promise<void> {
    if (this.messages.length > 0) return;
    const systemPrompt = await buildEffectiveSystemPrompt({
      cwd: this.config.cwd,
      appendSystemPrompt: this.config.appendSystemPrompt,
    });
    this.messages.push({ role: "system", content: systemPrompt });
  }

  private async compactMessagesIfNeeded(signal?: AbortSignal): Promise<void> {
    if (this.messages.length <= 1) return;

    const budget = this.config.contextBudgetTokens ?? DEFAULT_CONTEXT_BUDGET_TOKENS;
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
          content: "Summarize prior workspace-agent conversation for future continuity. Preserve user goals, decisions, file paths, tool results, unresolved tasks, and important constraints. Do not invent facts.",
        },
        { role: "user", content: rendered },
      ],
      temperature: 0.1,
      maxTokens: 1400,
      timeoutMs: 60000,
      signal,
    });
    return stringifyMessageContent(response.message.content) || "No prior context summary was produced.";
  }

  private trySimpleLocalReply(prompt: string): string | null {
    const normalized = prompt.trim().toLowerCase();
    if (["你好", "hi", "hello", "嗨"].includes(normalized)) {
      return "你好，我是 Novel Guide。你可以让我阅读项目文件、检查章节、分拣外部材料，或运行 /novel-init 初始化小说工作区。";
    }
    return null;
  }
}

function estimateMessagesTokens(messages: ChatCompletionMessageParam[]): number {
  const chars = messages.reduce((sum, message) => sum + renderMessageForCompaction(message).length, 0);
  return Math.ceil(chars / 3);
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
