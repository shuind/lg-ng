import type { Skill } from "@/lib/types"

export function skillTypeLabel(skill: Skill): string {
  if (skill.source === "style_guide" || skill.type === "style_guide") return "创作指南"
  if (skill.source === "claude_skill") return "本地 Skill"
  return skill.type
}

export function skillDisplayName(skill: Skill): string {
  return skill.name || (skill.type === "style_guide" ? "创作指南" : skill.id)
}
