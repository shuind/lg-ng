import type { Skill } from "@/lib/types"
import { skillKindLabel } from "@/lib/skill-kind"

export function skillTypeLabel(skill: Skill): string {
  if (skill.source === "plot_design" || skill.type === "plot_design") return "剧情设计指南"
  if (skill.source === "workspace_skill") return "本地 Skill"
  return skill.type
}

export function skillDisplayName(skill: Skill): string {
  return skill.name || (skill.type === "plot_design" ? "剧情设计指南" : skill.id)
}

export function skillKindTag(skill: Skill): string {
  return skillKindLabel(skill.kind)
}
