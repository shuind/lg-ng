import path from "path"
import type { CreateSkillRequest, SkillResourceKind, SkillTextResource } from "@/lib/types"

const MAX_RESOURCE_CHARS = 200_000

export const RESOURCE_ROOTS: SkillResourceKind[] = ["references", "scripts", "assets"]

export function normalizeSkillName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
}

export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SkillValidationError"
  }
}

export class SkillConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SkillConflictError"
  }
}

export class SkillNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SkillNotFoundError"
  }
}

export function isValidSkillName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64
}

export function safeYamlValue(value: string): string {
  return JSON.stringify(value.replace(/\r?\n/g, " ").trim())
}

export function normalizeResourceKinds(kinds: unknown): SkillResourceKind[] {
  if (!Array.isArray(kinds)) return []
  return RESOURCE_ROOTS.filter((kind) => kinds.includes(kind))
}

export function normalizeResourcePath(rawPath: string): string {
  const normalized = rawPath.trim().replace(/\\/g, "/")
  const parts = normalized.split("/").filter(Boolean)

  if (!normalized || parts.length === 0) {
    throw new SkillValidationError("资源文件路径不能为空。")
  }
  if (path.isAbsolute(rawPath) || /^[a-zA-Z]:/.test(rawPath) || normalized.startsWith("/")) {
    throw new SkillValidationError(`资源文件路径必须是相对路径：${rawPath}`)
  }
  if (parts.includes("..")) {
    throw new SkillValidationError(`资源文件路径不能包含 '..'：${rawPath}`)
  }
  if (!RESOURCE_ROOTS.includes(parts[0] as SkillResourceKind)) {
    throw new SkillValidationError(`资源文件路径必须以 references/、scripts/ 或 assets/ 开头：${rawPath}`)
  }
  if (parts.some((part) => part.toLowerCase() === "skill.md")) {
    throw new SkillValidationError(`资源文件不能指向 SKILL.md：${rawPath}`)
  }

  return parts.join("/")
}

export function validateSkillDraft(input: CreateSkillRequest): {
  name: string
  skillMd: string
  resources: SkillTextResource[]
  meta: Record<string, string>
} {
  const name = normalizeSkillName(input.name)
  if (!name || !isValidSkillName(name)) {
    throw new SkillValidationError("Skill 短名只能使用小写英文字母、数字和连字符。")
  }

  const skillMd = input.skillMd.trimEnd() + "\n"
  const meta = validateSkillMd(name, skillMd)
  const resources = normalizeTextResources(input.resources)
  return { name, skillMd, resources, meta }
}

export function parseSkillFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith("---")) return {}
  const end = content.indexOf("\n---", 3)
  if (end < 0) return {}

  const raw = content.slice(3, end).trim()
  const meta: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    meta[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
  }
  return meta
}

function normalizeTextResources(resources: SkillTextResource[] | undefined): SkillTextResource[] {
  const normalized: SkillTextResource[] = []
  const seen = new Set<string>()

  for (const resource of resources ?? []) {
    if (!resource || typeof resource.path !== "string" || typeof resource.content !== "string") {
      throw new SkillValidationError("每个资源文件都需要 path 和文本 content。")
    }
    if (resource.content.length > MAX_RESOURCE_CHARS) {
      throw new SkillValidationError(`资源文件太大：${resource.path}`)
    }

    const resourcePath = normalizeResourcePath(resource.path)
    if (seen.has(resourcePath)) {
      throw new SkillValidationError(`资源文件路径重复：${resourcePath}`)
    }
    seen.add(resourcePath)
    normalized.push({ path: resourcePath, content: resource.content })
  }

  return normalized
}

function validateSkillMd(name: string, skillMd: string): Record<string, string> {
  if (typeof skillMd !== "string" || !skillMd.trim()) {
    throw new SkillValidationError("必须填写 SKILL.md 内容。")
  }
  if (!skillMd.trimStart().startsWith("---")) {
    throw new SkillValidationError("SKILL.md 必须以 YAML frontmatter 开头，也就是文件开头要有 ---。")
  }

  const meta = parseSkillFrontmatter(skillMd.trimStart())
  if (!meta.name) {
    throw new SkillValidationError("SKILL.md 开头的 frontmatter 必须包含 name。")
  }
  if (!meta.description) {
    throw new SkillValidationError("SKILL.md 开头的 frontmatter 必须包含 description。")
  }
  if (!isValidSkillName(meta.name)) {
    throw new SkillValidationError("frontmatter 里的 name 只能使用小写英文字母、数字和连字符。")
  }
  if (meta.name !== name) {
    throw new SkillValidationError("frontmatter 里的 name 必须和 Skill 目录短名一致。")
  }

  return meta
}
