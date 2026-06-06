import type { Tool } from "./tool.js";
import { loadSkillsDir } from "../skills/loadSkillsDir.js";

export function createSkillTools(): Tool[] {
  return [
    {
      name: "load_skill",
      description: "Load the full prompt content for a project skill by name.",
      readonly: true,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          args: { type: "string" },
        },
        required: ["name"],
      },
      requiresPermission() {
        return { allowed: true };
      },
      async execute(input, context) {
        const name = typeof input.name === "string" ? input.name : "";
        const args = typeof input.args === "string" ? input.args : "";
        const skill = (await loadSkillsDir(context.cwd)).find((item) => item.name === name);
        if (!skill) return { ok: false, content: `Skill not found: ${name}` };
        return {
          ok: true,
          content: `Loaded skill: ${skill.name}\nDescription: ${skill.description}\n\n${skill.content.replace(/\{\{args\}\}/g, args)}`,
        };
      },
    },
  ];
}
