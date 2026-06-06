import type { Tool } from "./tool.js";

export const AskUserTool: Tool = {
  name: "ask_user",
  description: "Ask the user a concise question when required to continue.",
  readonly: true,
  parameters: {
    type: "object",
    properties: {
      question: { type: "string" },
    },
    required: ["question"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input) {
    const question = typeof input.question === "string" ? input.question : "Need user input.";
    return {
      ok: true,
      content: `Question for user: ${question}\nThe CLI will show this in the assistant reply; no hidden answer is available.`,
    };
  },
};

export function allAskUserTools(): Tool[] {
  return [AskUserTool];
}
