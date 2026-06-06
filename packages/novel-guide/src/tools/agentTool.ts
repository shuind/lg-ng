import type { Tool } from "./tool.js";
import { findAgent } from "../agents/loadAgentsDir.js";

export function createAgentTools(): Tool[] {
  return [
    {
      name: "run_agent",
      description: "Run a project subagent in an isolated context. Use for read-only reviews like continuity or canon conflict.",
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
        const agent = await findAgent(context.cwd, agentName);
        if (!agent) return { ok: false, content: `Agent not found: ${agentName}` };
        if (!context.runAgent) {
          return {
            ok: false,
            content: "run_agent is unavailable in this execution context.",
          };
        }
        const output = await context.runAgent({
          agent: agent.name,
          prompt: `${agent.prompt}\n\n# Task\n${prompt}`,
          readonly: input.readonly !== false,
        });
        return { ok: true, content: output };
      },
    },
  ];
}
