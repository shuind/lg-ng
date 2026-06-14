export const WORKSPACE_CONFIG_DIR = ".novel-guide"
export const LEGACY_WORKSPACE_CONFIG_DIR = ".claude"

export const WORKSPACE_GUIDE_FILE = "GUIDE.md"
export const LEGACY_WORKSPACE_GUIDE_FILE = "CLAUDE.md"

export const WORKSPACE_SKILLS_DIR = `${WORKSPACE_CONFIG_DIR}/skills`
export const LEGACY_WORKSPACE_SKILLS_DIR = `${LEGACY_WORKSPACE_CONFIG_DIR}/skills`

export const WORKSPACE_SKILL_SOURCE = "workspace_skill"
export const LEGACY_WORKSPACE_SKILL_SOURCE = "claude_skill"

export const WORKSPACE_SKILL_SOURCE_VALUES = [
  WORKSPACE_SKILL_SOURCE,
  LEGACY_WORKSPACE_SKILL_SOURCE,
] as const

export function isWorkspaceSkillSource(source: unknown): boolean {
  return WORKSPACE_SKILL_SOURCE_VALUES.includes(source as (typeof WORKSPACE_SKILL_SOURCE_VALUES)[number])
}
