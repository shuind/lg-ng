import type { Skill } from "@/lib/types"
import { skillKindLabel } from "@/lib/skill-kind"

export function skillTypeLabel(skill: Skill): string {
  if (skill.source === "workspace_skill") return "本地 Skill"
  return skill.type
}

export function skillDisplayName(skill: Skill): string {
  return skill.name || skill.id
}

export function skillKindTag(skill: Skill): string {
  return skillKindLabel(skill.kind)
}
