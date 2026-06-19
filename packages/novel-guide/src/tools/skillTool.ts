import type { Tool } from "./tool.js";
import { loadSkillsDir } from "../skills/loadSkillsDir.js";

export function createSkillTools(): Tool[] {
  return [
    {
      name: "load_skill",
      description: "按名称从项目 `.novel-guide/skills/<name>/SKILL.md` 中加载项目 skill 的完整 prompt 内容。若要创建新 skill，请使用 write_file 写入该路径，并包含 name、kind、description 的 YAML 头部；kind 必须是 writing（控制正文怎么生成）、judgment（控制 AI 怎么看问题）或 method（控制任务怎么完成）。",
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
          content: `已加载 skill：${skill.name}\n类型：${skill.kind}\n说明：${skill.description}\n\n${skill.content.replace(/\{\{args\}\}/g, args)}`,
        };
      },
    },
  ];
}
