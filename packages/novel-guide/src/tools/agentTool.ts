import type { Tool } from "./tool.js";

export function createAgentTools(): Tool[] {
  return [
    {
      name: "run_agent",
      description: "在隔离上下文运行项目子智能体。默认拥有完整工具权限；需要只读评审时传 readonly=true。",
      readonly: false,
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
          readonly: input.readonly === true,
        });
        return { ok: true, content: output };
      },
    },
  ];
}
