import type { Tool } from "./tool.js";

export function createAgentTools(): Tool[] {
  return [
    {
      name: "run_agent",
      description: "在隔离上下文运行项目子智能体。适合连续性、正典冲突等只读评审。",
      readonly: true,
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string" },
          prompt: { type: "string" },
          readonly: { type: "boolean" },
        },
        required: ["agent", "prompt"],
      },
      requiresPermission() {
        return { allowed: true };
      },
      async execute(input, context) {
        const agentName = typeof input.agent === "string" ? input.agent : "";
        const prompt = typeof input.prompt === "string" ? input.prompt : "";
        if (!context.runAgent) {
          return {
            ok: false,
            content: "run_agent is unavailable in this execution context.",
          };
        }
        const output = await context.runAgent({
          agent: agentName,
          prompt,
          readonly: input.readonly !== false,
        });
        return { ok: true, content: output };
      },
    },
  ];
}
