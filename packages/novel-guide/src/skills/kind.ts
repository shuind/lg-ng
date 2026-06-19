export const SKILL_KINDS = ["writing", "judgment", "method"] as const;

export type SkillKind = typeof SKILL_KINDS[number];

export function normalizeSkillKind(value: unknown): SkillKind {
  return SKILL_KINDS.includes(value as SkillKind) ? value as SkillKind : "method";
}
