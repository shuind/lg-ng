import type { Tool } from "./tool.js";
import { loadSkillsDir } from "../skills/loadSkillsDir.js";

export function createSkillTools(): Tool[] {
  return [
    {
      name: "load_skill",
      description: "按名称从项目 `.novel-guide/skills/<name>/SKILL.md` 中加载项目 skill 的完整 prompt 内容。若要创建新 skill，请使用 write_file 写入该路径，并包含 name 和 description 的 YAML 头部。",
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
        if (!skill) return { ok: false, content: `未找到 skill：${name}` };
        return {
          ok: true,
          content: `已加载 skill：${skill.name}\n说明：${skill.description}\n\n${skill.content.replace(/\{\{args\}\}/g, args)}`,
        };
      },
    },
  ];
}
