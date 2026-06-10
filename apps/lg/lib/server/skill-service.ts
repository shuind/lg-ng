import fs from "fs/promises"
import path from "path"
import type { Dirent } from "node:fs"
import type {
  CreateSkillRequest,
  Skill,
  SkillDraftResponse,
  SkillSummary,
  SkillTextResource,
  UpdateSkillRequest,
} from "@/lib/types"
import { readBookFile, getBookFileMtime } from "@/lib/server/book-store"
import { getBookDir } from "@/lib/server/paths"
import { rebuildBookIndexes, updateIndexedFile } from "@/lib/server/book-index"
import {
  RESOURCE_ROOTS,
  SkillConflictError,
  SkillNotFoundError,
  SkillValidationError,
  isValidSkillName,
  normalizeSkillName,
  parseSkillFrontmatter,
  validateSkillDraft,
} from "@/lib/server/skill-validation"

export {
  SkillConflictError,
  SkillNotFoundError,
  SkillValidationError,
  normalizeSkillName,
  validateSkillDraft,
} from "@/lib/server/skill-validation"

const SOURCE_FILE = "创作指南.md"
const SUMMARY_FILE = "skills/style_guide_summary.md"
const META_FILE = "skills/style_guide.skill.json"
const CLAUDE_SKILLS_DIR = ".claude/skills"

const SUMMARY_MAX_CHARS = 500

const KEYWORD_LINES = ["文风", "语感", "禁忌", "人物", "结构", "节奏", "偏好", "塑造", "风格", "写法"]

// ─── Paths ────────────────────────────────────────────────────

function metaPath(bookId: string): string {
  return path.join(getBookDir(bookId), META_FILE)
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 1.5)
}

function toRelativePath(...parts: string[]): string {
  return parts.filter(Boolean).join("/")
}

function claudeSkillsRoot(bookId: string): string {
  return path.join(getBookDir(bookId), CLAUDE_SKILLS_DIR)
}

function claudeSkillDir(bookId: string, name: string): string {
  return path.join(claudeSkillsRoot(bookId), name)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function touchBookUpdatedAt(bookId: string): Promise<void> {
  try {
    const bookJsonPath = path.join(getBookDir(bookId), "book.json")
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    meta.updatedAt = new Date().toISOString()
    await fs.writeFile(bookJsonPath, JSON.stringify(meta, null, 2), "utf-8")
  } catch {
    // 更新书籍元信息失败不应阻断 Skill 保存。
  }
}

function resolveResourceWritePath(skillRoot: string, resourcePath: string): string {
  const resolvedSkillRoot = path.resolve(skillRoot)
  const absPath = path.resolve(skillRoot, resourcePath)
  if (!absPath.startsWith(resolvedSkillRoot + path.sep)) {
    throw new SkillValidationError(`资源文件路径越出了当前 Skill 目录：${resourcePath}`)
  }
  return absPath
}

function toClaudeSkillRecord(
  bookId: string,
  directoryName: string,
  skillMd: string,
  meta: Record<string, string>,
  mtimeIso: string,
): Skill {
  return {
    id: `claude-skill-${directoryName}`,
    type: "claude_skill",
    name: meta.name || directoryName,
    description: meta.description || meta.when_to_use || "",
    scope: "book",
    bookId,
    sourceFile: toRelativePath(CLAUDE_SKILLS_DIR, directoryName, "SKILL.md"),
    summaryTokenCount: estimateTokens(skillMd),
    lastSourceModified: mtimeIso,
    lastSummaryGenerated: mtimeIso,
    dirty: false,
    source: "claude_skill",
  }
}

async function writeClaudeSkillContents(
  targetDir: string,
  skillMd: string,
  resources: SkillTextResource[],
): Promise<void> {
  await fs.writeFile(path.join(targetDir, "SKILL.md"), skillMd, "utf-8")

  for (const resource of resources) {
    const absPath = resolveResourceWritePath(targetDir, resource.path)
    const existing = await fs.readFile(absPath).catch(() => null)
    if (existing && !isEditableTextBuffer(existing)) {
      throw new SkillValidationError(`这个资源路径上已经有非文本文件，不能覆盖：${resource.path}`)
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, resource.content, "utf-8")
  }
}

function isEditableTextBuffer(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false
  return !buffer.toString("utf-8").includes("\uFFFD")
}

async function readTextResourcesFromDir(targetDir: string): Promise<{
  resources: SkillTextResource[]
  warnings: string[]
}> {
  const resources: SkillTextResource[] = []
  const warnings: string[] = []

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name)
      const relPath = toRelativePath(relDir, entry.name)
      if (entry.isDirectory()) {
        await walk(absPath, relPath)
        continue
      }
      if (!entry.isFile()) continue

      const buffer = await fs.readFile(absPath)
      if (!isEditableTextBuffer(buffer)) {
        warnings.push(`已跳过非文本资源文件：${relPath}`)
        continue
      }
      resources.push({ path: relPath, content: buffer.toString("utf-8") })
    }
  }

  for (const root of RESOURCE_ROOTS) {
    await walk(path.join(targetDir, root), root)
  }

  return {
    resources: resources.sort((a, b) => a.path.localeCompare(b.path)),
    warnings,
  }
}

async function removeExistingTextResources(targetDir: string): Promise<void> {
  async function walk(absDir: string): Promise<void> {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name)
      if (entry.isDirectory()) {
        await walk(absPath)
        await fs.rmdir(absPath).catch(() => {})
        continue
      }
      if (!entry.isFile()) continue

      const buffer = await fs.readFile(absPath).catch(() => null)
      if (buffer && isEditableTextBuffer(buffer)) {
        await fs.rm(absPath, { force: true })
      }
    }
  }

  for (const root of RESOURCE_ROOTS) {
    await walk(path.join(targetDir, root))
    await fs.rmdir(path.join(targetDir, root)).catch(() => {})
  }
}

export async function createClaudeSkill(bookId: string, input: CreateSkillRequest): Promise<Skill> {
  const { name, skillMd, resources, meta } = validateSkillDraft(input)
  const skillsDir = claudeSkillsRoot(bookId)
  const targetDir = claudeSkillDir(bookId, name)

  try {
    await fs.mkdir(targetDir, { recursive: false })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.mkdir(skillsDir, { recursive: true })
      await fs.mkdir(targetDir, { recursive: false })
    } else if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new SkillConflictError(`同名 Skill 已存在：${name}`)
    } else {
      throw error
    }
  }

  try {
    await writeClaudeSkillContents(targetDir, skillMd, resources)
    await touchBookUpdatedAt(bookId)
    await rebuildBookIndexes(bookId).catch(() => {})
  } catch (error) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  const stat = await fs.stat(path.join(targetDir, "SKILL.md"))
  return toClaudeSkillRecord(bookId, name, skillMd, meta, stat.mtime.toISOString())
}

export async function readClaudeSkillDraft(bookId: string, rawName: string): Promise<SkillDraftResponse> {
  const name = normalizeSkillName(rawName)
  if (!name || !isValidSkillName(name)) {
    throw new SkillValidationError("Skill 短名只能使用小写英文字母、数字和连字符。")
  }

  const targetDir = claudeSkillDir(bookId, name)
  const skillPath = path.join(targetDir, "SKILL.md")
  if (!(await fileExists(skillPath))) {
    throw new SkillNotFoundError(`找不到这个 Skill：${name}`)
  }

  const [skillMd, resourceResult] = await Promise.all([
    fs.readFile(skillPath, "utf-8"),
    readTextResourcesFromDir(targetDir),
  ])

  return {
    name,
    skillMd: skillMd.trimEnd() + "\n",
    resources: resourceResult.resources,
    warnings: resourceResult.warnings,
  }
}

export async function updateClaudeSkill(bookId: string, input: UpdateSkillRequest): Promise<Skill> {
  const originalName = normalizeSkillName(input.originalName)
  if (!originalName || !isValidSkillName(originalName)) {
    throw new SkillValidationError("原 Skill 短名只能使用小写英文字母、数字和连字符。")
  }

  const { name, skillMd, resources, meta } = validateSkillDraft(input)
  const originalDir = claudeSkillDir(bookId, originalName)
  const targetDir = claudeSkillDir(bookId, name)
  const originalSkillPath = path.join(originalDir, "SKILL.md")

  if (!(await fileExists(originalSkillPath))) {
    throw new SkillNotFoundError(`找不到这个 Skill：${originalName}`)
  }
  if (name !== originalName && await dirExists(targetDir)) {
    throw new SkillConflictError(`同名 Skill 已存在：${name}`)
  }

  let activeDir = originalDir
  let renamed = false
  if (name !== originalName) {
    await fs.rename(originalDir, targetDir)
    activeDir = targetDir
    renamed = true
  }

  try {
    await removeExistingTextResources(activeDir)
    await writeClaudeSkillContents(activeDir, skillMd, resources)
    await touchBookUpdatedAt(bookId)
    await rebuildBookIndexes(bookId).catch(() => {})
  } catch (error) {
    if (renamed && !(await dirExists(originalDir)) && await dirExists(targetDir)) {
      await fs.rename(targetDir, originalDir).catch(() => {})
    }
    throw error
  }

  const stat = await fs.stat(path.join(activeDir, "SKILL.md"))
  return toClaudeSkillRecord(bookId, name, skillMd, meta, stat.mtime.toISOString())
}

function normalizeStyleGuideSkill(bookId: string, skill: Skill, dirty: boolean): Skill {
  return {
    ...skill,
    id: skill.id || `skill-style-${bookId}`,
    type: "style_guide",
    name: skill.name || "创作指南",
    description: skill.description || "文风、语感、禁忌和偏好的压缩层",
    scope: "book",
    bookId,
    sourceFile: SOURCE_FILE,
    summaryFile: SUMMARY_FILE,
    source: "style_guide",
    dirty,
  }
}

// ─── Metadata I/O ─────────────────────────────────────────────

async function readMeta(bookId: string): Promise<Skill | null> {
  try {
    const raw = await fs.readFile(metaPath(bookId), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function writeMeta(skill: Skill): Promise<void> {
  await fs.mkdir(path.dirname(metaPath(skill.bookId!)), { recursive: true })
  await fs.writeFile(metaPath(skill.bookId!), JSON.stringify(skill, null, 2), "utf-8")
}

// ─── Summary Generation (rule-based, no LLM) ─────────────────

function generateSummary(content: string): string {
  if (!content.trim()) {
    return "# 创作指南摘要\n\n（创作指南为空,请在工作台编辑创作指南.md）\n"
  }

  const lines = content.split("\n")
  const picked: string[] = []
  let inKeywordSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (inKeywordSection && picked.length > 0 && picked[picked.length - 1] !== "") {
        picked.push("")
      }
      continue
    }

    // headings: always include h1/h2, skip h3+
    if (/^#{1,2}\s/.test(trimmed)) {
      picked.push(trimmed)
      inKeywordSection = KEYWORD_LINES.some((kw) => trimmed.includes(kw))
      continue
    }

    // lines in keyword-matching sections
    if (inKeywordSection) {
      picked.push(trimmed)
      continue
    }

    // lines containing keywords anywhere
    if (KEYWORD_LINES.some((kw) => trimmed.includes(kw))) {
      picked.push(trimmed)
    }
  }

  // if nothing picked, take first few non-empty lines
  if (picked.filter((l) => l.trim()).length === 0) {
    const fallback = lines.filter((l) => l.trim()).slice(0, 8)
    picked.push(...fallback)
  }

  // build output, truncate to SUMMARY_MAX_CHARS
  let output = "# 创作指南摘要\n\n"
  for (const line of picked) {
    const next = line === "" ? "\n" : line + "\n"
    if (output.length + next.length > SUMMARY_MAX_CHARS) break
    output += next
  }

  return output.trimEnd() + "\n"
}

// ─── Public API ───────────────────────────────────────────────

export async function getStyleGuideSkill(bookId: string): Promise<{ skill: Skill; summary: string }> {
  let skill = await readMeta(bookId)

  // check if source file is newer
  const sourceMtime = await getBookFileMtime(bookId, SOURCE_FILE)
  const dirty = !skill || sourceMtime > skill.lastSourceModified

  if (!skill) {
    skill = {
      id: `skill-style-${bookId}`,
      type: "style_guide",
      name: "创作指南",
      description: "文风、语感、禁忌和偏好的压缩层",
      scope: "book",
      bookId,
      sourceFile: SOURCE_FILE,
      summaryFile: SUMMARY_FILE,
      summaryTokenCount: 0,
      lastSourceModified: sourceMtime,
      lastSummaryGenerated: "",
      dirty,
      source: "style_guide",
    }
  } else {
    skill = normalizeStyleGuideSkill(bookId, skill, dirty)
  }

  const summary = await readStyleGuideSummary(bookId)
  return { skill, summary }
}

async function listClaudeSkills(bookId: string): Promise<Skill[]> {
  const bookDir = getBookDir(bookId)
  const skillsDir = path.join(bookDir, CLAUDE_SKILLS_DIR)
  let entries: Dirent<string>[]

  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const skills: Skill[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const sourceFile = toRelativePath(CLAUDE_SKILLS_DIR, entry.name, "SKILL.md")
    const sourceAbs = path.join(bookDir, sourceFile)
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(sourceAbs, "utf-8"),
        fs.stat(sourceAbs),
      ])
      const meta = parseSkillFrontmatter(content)
      const skillName = meta.name || entry.name
      skills.push({
        id: `claude-skill-${entry.name}`,
        type: "claude_skill",
        name: skillName,
        description: meta.description || meta.when_to_use || "",
        scope: "book",
        bookId,
        sourceFile,
        summaryTokenCount: estimateTokens(content),
        lastSourceModified: stat.mtime.toISOString(),
        lastSummaryGenerated: stat.mtime.toISOString(),
        dirty: false,
        source: "claude_skill",
      })
    } catch {
      // Ignore malformed skill directories.
    }
  }

  return skills.sort((a, b) => skillDisplaySortKey(a).localeCompare(skillDisplaySortKey(b), "zh-CN"))
}

function skillDisplaySortKey(skill: Skill): string {
  return `${skill.source === "style_guide" ? "0" : "1"}:${skill.name ?? skill.id}`
}

export async function listSkills(bookId: string): Promise<Skill[]> {
  const { skill } = await getStyleGuideSkill(bookId)
  const claudeSkills = await listClaudeSkills(bookId)
  return [skill, ...claudeSkills]
}

export async function resolveSkillSummaries(bookId: string, skillIds: string[]): Promise<SkillSummary[]> {
  const wantedIds = new Set(skillIds)
  if (wantedIds.size === 0) return []

  const skills = await listSkills(bookId)
  const summaries: SkillSummary[] = []
  for (const skill of skills) {
    if (!wantedIds.has(skill.id)) continue

    let summary = ""
    if (skill.type === "style_guide") {
      summary = await readStyleGuideSummary(bookId)
    } else if (skill.source === "claude_skill") {
      summary = await readBookFile(bookId, skill.sourceFile) ?? ""
    }

    summaries.push({
      skill,
      summary,
      refreshable: skill.type === "style_guide",
    })
  }

  return summaries
}

export async function readStyleGuideSummary(bookId: string): Promise<string> {
  const content = await readBookFile(bookId, SUMMARY_FILE)
  return content ?? ""
}

export async function refreshStyleGuideSummary(bookId: string): Promise<{ skill: Skill; summary: string }> {
  const sourceContent = await readBookFile(bookId, SOURCE_FILE)
  const sourceMtime = await getBookFileMtime(bookId, SOURCE_FILE)

  const summary = generateSummary(sourceContent ?? "")

  // write summary file (goes through normal file write, not writeBookFile, to avoid ledger noise)
  const summaryAbs = path.join(getBookDir(bookId), SUMMARY_FILE)
  await fs.mkdir(path.dirname(summaryAbs), { recursive: true })
  await fs.writeFile(summaryAbs, summary, "utf-8")
  await updateIndexedFile(bookId, SUMMARY_FILE, summary).catch(() => {})

  // estimate token count (rough: 1 token ≈ 1.5 Chinese chars)
  const charCount = summary.length
  const tokenCount = Math.ceil(charCount / 1.5)

  let skill = await readMeta(bookId)
  if (!skill) {
    skill = {
      id: `skill-style-${bookId}`,
      type: "style_guide",
      name: "创作指南",
      description: "文风、语感、禁忌和偏好的压缩层",
      scope: "book",
      bookId,
      sourceFile: SOURCE_FILE,
      summaryFile: SUMMARY_FILE,
      summaryTokenCount: tokenCount,
      lastSourceModified: sourceMtime,
      lastSummaryGenerated: new Date().toISOString(),
      dirty: false,
      source: "style_guide",
    }
  } else {
    skill = normalizeStyleGuideSkill(bookId, skill, false)
    skill.summaryTokenCount = tokenCount
    skill.lastSourceModified = sourceMtime
    skill.lastSummaryGenerated = new Date().toISOString()
    skill.dirty = false
  }

  await writeMeta(skill)
  return { skill, summary }
}
