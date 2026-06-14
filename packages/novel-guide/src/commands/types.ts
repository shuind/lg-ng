// Slash commands are either prompt-expansion commands or
// local commands. Prompt commands may be user-invoked or model-invoked.

import type { ToolContext, ToolResult } from "../tools/tool.js";

export type PromptCommand = {
  type: "prompt";
  name: string;
  description: string;
  argumentHint?: string;
  whenToUse?: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
  source: "builtin" | "skills" | "project";
  getPromptForCommand(args: string, context: ToolContext): Promise<string>;
};

export type LocalCommand = {
  type: "local";
  name: string;
  description: string;
  argumentHint?: string;
  userInvocable: boolean;
  source: "builtin" | "project";
  execute(args: string, context: ToolContext): Promise<ToolResult>;
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
