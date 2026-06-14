import type { Skill } from "@/lib/types"
import { LEGACY_WORKSPACE_SKILLS_DIR, WORKSPACE_SKILLS_DIR } from "@/lib/workspace-layout"

export function skillDisplayName(skill: Skill): string {
  return skill.name || (skill.type === "style_guide" ? "创作指南" : skill.id)
}

export function skillKindLabel(skill: Skill): string {
  if (skill.source === "style_guide" || skill.type === "style_guide") return "创作指南"
  if (skill.source === "workspace_skill") return "本地 Skill"
  return skill.type
}

export function normalizeSkillInputName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
}

export function skillDirectoryName(skill: Skill): string | null {
  const normalized = skill.sourceFile.replace(/\\/g, "/")
  for (const skillsDir of [WORKSPACE_SKILLS_DIR, LEGACY_WORKSPACE_SKILLS_DIR]) {
    const prefix = `${skillsDir}/`
    if (!normalized.startsWith(prefix) || !normalized.endsWith("/SKILL.md")) continue

    const directoryName = normalized.slice(prefix.length, -"/SKILL.md".length)
    if (directoryName && !directoryName.includes("/")) return directoryName
  }
  return null
}

export function syncSkillMdName(content: string, nextName: string, previousName: string): string {
  const lines = content.split(/\r?\n/)
  if (lines[0] !== "---") return content

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") return content
    const match = lines[index].match(/^name:\s*(.*)$/)
    if (!match) continue

    const currentName = normalizeSkillInputName(match[1].replace(/^["']|["']$/g, ""))
    if (currentName && previousName && currentName !== previousName) return content
    lines[index] = `name: ${nextName}`
    return lines.join("\n")
  }

  return content
}

export function createDefaultSkillMd(name: string): string {
  return [
    "---",
    `name: ${name}`,
    'description: "当前书籍项目内可复用的小说写作流程。"',
    'when_to_use: "当用户明确需要这套写作流程时使用。"',
    'argument-hint: "[范围或参考材料]"',
    "---",
    "",
    `# ${name}`,
    "",
    "这个 Skill 用来沉淀一套可复用的小说写作流程。",
    "",
    "## 工作流程",
    "",
    "1. 先确认用户这次想要的具体产出。",
    "2. 判断是否需要读取相关书籍文件，不要凭空断言。",
    "3. 结合项目设定、写作约束和必要参考资料处理。",
    "4. 输出结果时保持简洁，需要时给出相关文件路径。",
    "",
  ].join("\n")
}
