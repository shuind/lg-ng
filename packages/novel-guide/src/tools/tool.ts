// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/Tool.ts
// Mechanism copied: each tool owns name, description, input schema,
// permission check, execution, and result rendering. Business actions are not
// tools; tools expose real workspace capabilities.

import type { ModelTool } from "../model/deepseek.js";

export type PermissionDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      confirmationRequired?: boolean;
      forceConfirmation?: boolean;
      cacheKey?: string;
    };

export interface ToolContext {
  cwd: string;
  signal?: AbortSignal;
  permissionMode?: "bypass" | "confirm";
  askConfirmation?: (question: string) => Promise<boolean>;
  permissionCache?: Map<string, boolean>;
  runAgent?: (input: { agent: string; prompt: string; readonly?: boolean }) => Promise<string>;
}

export interface FileChange {
  path: string;
  operation: "write" | "edit";
  beforeExists?: boolean;
  charCount?: number;
  beforeContent?: string | null;
  afterContent?: string;
}

export interface FileProposal {
  path: string;
  beforeExists?: boolean;
  beforeContent: string;
  afterContent: string;
  summary?: string;
  source?: "chat" | "draft" | "workflow";
}

export interface ToolResult {
  ok: boolean;
  content: string;
  metadata?: Record<string, unknown> & {
    fileChanges?: FileChange[];
    proposals?: FileProposal[];
  };
}

export interface Tool<TInput extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readonly: boolean;
  requiresPermission(input: TInput, context: ToolContext): Promise<PermissionDecision> | PermissionDecision;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}

export type Tools = Tool[];

export function toModelTool(tool: Tool): ModelTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

export function findTool(tools: Tools, name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

export async function runTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const decision = await tool.requiresPermission(input, context);
  if (!decision.allowed) {
    if (context.permissionMode !== "confirm" && !decision.forceConfirmation) {
      return await executeTool(tool, input, context);
    }
    if (!decision.confirmationRequired || !context.askConfirmation) {
      return { ok: false, content: `Permission denied for ${tool.name}: ${decision.reason}` };
    }
    if (decision.cacheKey && context.permissionCache?.has(decision.cacheKey)) {
      const cached = context.permissionCache.get(decision.cacheKey);
      if (!cached) return { ok: false, content: `User denied ${tool.name}.` };
    } else {
    const approved = await context.askConfirmation(`${decision.reason}\nAllow ${tool.name}?`);
      if (decision.cacheKey) context.permissionCache?.set(decision.cacheKey, approved);
    if (!approved) return { ok: false, content: `User denied ${tool.name}.` };
    }
  }

  return await executeTool(tool, input, context);
}

async function executeTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    return await tool.execute(input, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, content: `${tool.name} failed: ${message}` };
  }
}
