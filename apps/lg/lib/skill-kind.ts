import type { Skill, SkillKind } from "./types"

export const SKILL_KIND_OPTIONS: Array<{ kind: SkillKind; label: string; description: string }> = [
  {
    kind: "writing",
    label: "写作",
    description: "控制正文怎么生成",
  },
  {
    kind: "judgment",
    label: "判断",
    description: "控制 AI 怎么看问题",
  },
  {
    kind: "method",
    label: "方法",
    description: "控制任务怎么完成",
  },
]

export function skillKindLabel(kind: SkillKind): string {
  return SKILL_KIND_OPTIONS.find((item) => item.kind === kind)?.label ?? "方法"
}

export function skillKindDescription(kind: SkillKind): string {
  return SKILL_KIND_OPTIONS.find((item) => item.kind === kind)?.description ?? "控制任务怎么完成"
}

export function skillKindSortIndex(skill: Skill): number {
  const index = SKILL_KIND_OPTIONS.findIndex((item) => item.kind === skill.kind)
  return index >= 0 ? index : SKILL_KIND_OPTIONS.length
}
