// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/QueryEngine.ts
// Mechanism copied: one engine per conversation; messages persist across
// turns; submitMessage builds context, invokes query(), accumulates usage, and
// writes session state.

import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildEffectiveSystemPrompt } from "../prompts/systemPrompt.js";
import { getTools } from "../tools/registry.js";
import type { FileChange, ToolContext, Tools } from "../tools/tool.js";
import { query } from "./query.js";
import { createSessionId, saveSession, type SessionState } from "./session.js";
import { findAgent, loadAgentsDir } from "../agents/loadAgentsDir.js";
import { loadSkillsDir } from "../skills/loadSkillsDir.js";

export interface EngineConfig {
  cwd: string;
  client: OpenAI;
  model: string;
  sessionId?: string;
  initialMessages?: ChatCompletionMessageParam[];
  appendSystemPrompt?: string;
  askConfirmation?: (question: string) => Promise<boolean>;
  permissionMode?: "bypass" | "confirm";
  maxLoops?: number;
  readonlyOnly?: boolean;
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

export class AgentEngine {
  private messages: ChatCompletionMessageParam[];
  private readonly sessionId: string;
  private readonly tools: Tools;

  constructor(private readonly config: EngineConfig) {
    this.sessionId = config.sessionId ?? createSessionId();
    this.messages = config.initialMessages ?? [];
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

  private createToolContext(permissionCache: Map<string, boolean>): ToolContext {
    return {
      cwd: this.config.cwd,
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
    options: { save?: boolean; systemMeta?: boolean } = {},
  ): Promise<EngineTurnResult> {
    const simpleReply = this.trySimpleLocalReply(prompt);
    if (simpleReply) {
      return {
        text: simpleReply,
        messages: this.messages,
        toolTrace: [],
        failedTools: [],
        fileChanges: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        sessionId: this.sessionId,
      };
    }

    if (this.messages.length === 0) {
      const systemPrompt = await buildEffectiveSystemPrompt({
        cwd: this.config.cwd,
        appendSystemPrompt: this.config.appendSystemPrompt,
      });
      this.messages.push({ role: "system", content: systemPrompt });
    }

    const userContext = await this.buildUserContext();
    const content = options.systemMeta
      ? `${userContext}\n\n${prompt}`
      : `${userContext}\n\nUser request:\n${prompt}`;
    const turnMessages: ChatCompletionMessageParam[] = [
      ...this.messages,
      { role: "user", content },
    ];

    const result = await query({
      client: this.config.client,
      model: this.config.model,
      messages: turnMessages,
      tools: this.tools,
      toolContext: this.createToolContext(new Map()),
      maxLoops: this.config.maxLoops ?? 8,
    });
    this.messages = result.messages;

    if (options.save !== false) {
      const state: SessionState = {
        id: this.sessionId,
        cwd: this.config.cwd,
        messages: this.messages,
        updatedAt: new Date().toISOString(),
      };
      await saveSession(state);
    }

    return {
      text: result.text,
      messages: this.messages,
      toolTrace: result.toolTrace,
      failedTools: result.failedTools,
      fileChanges: result.fileChanges,
      usage: result.usage,
      sessionId: this.sessionId,
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
