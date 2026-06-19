// Slash commands are either prompt-expansion commands or
// local commands. Prompt commands may be user-invoked or model-invoked.

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { SkillKind } from "../skills/kind.js";
import type { ToolContext, ToolResult } from "../tools/tool.js";

export interface CommandRuntimeEngine {
  getSessionId(): string;
  getMessagesSnapshot(): ChatCompletionMessageParam[];
  polishHandoffDraft?(draft: string, options: { profile: string; chapter: string; target: string }): Promise<string>;
  runReadonlySubAgent?(input: { agent: string; prompt: string }): Promise<string>;
}

export interface CommandContext extends ToolContext {
  engine?: CommandRuntimeEngine;
}

export type PromptCommand = {
  type: "prompt";
  name: string;
  kind?: SkillKind;
  description: string;
  argumentHint?: string;
  whenToUse?: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
  source: "builtin" | "skills" | "project";
  getPromptForCommand(args: string, context: CommandContext): Promise<string>;
};

export type LocalCommand = {
  type: "local";
  name: string;
  description: string;
  argumentHint?: string;
  userInvocable: boolean;
  source: "builtin" | "project";
  execute(args: string, context: CommandContext): Promise<ToolResult>;
};

export type Command = PromptCommand | LocalCommand;

export function getCommandName(command: Command): string {
  return command.name;
}

export function isSlashCommandInput(input: string): boolean {
  return /^\/[a-zA-Z0-9_-]+/.test(input.trim());
}

export function parseSlashInput(input: string): { name: string; args: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^\/([a-zA-Z0-9_-]+)\s*(.*)$/);
  if (!match) return null;
  return { name: match[1], args: match[2] ?? "" };
}
