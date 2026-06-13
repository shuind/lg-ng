import type { Tool } from "./tool.js";

export const AskUserTool: Tool = {
  name: "ask_user",
  description: "必须用户补充信息才能继续时，问一个简短问题。",
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
    const question = typeof input.question === "string" ? input.question : "需要用户补充信息。";
    return {
      ok: true,
      content: [
        `给用户的问题：${question}`,
        "在最终回复中向用户提出这个问题，并等待用户回答。没有隐藏答案可用。",
      ].join("\n"),
    };
  },
};

export function allAskUserTools(): Tool[] {
  return [AskUserTool];
}
