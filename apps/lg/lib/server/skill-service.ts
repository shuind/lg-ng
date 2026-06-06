import fs from "fs/promises"
import path from "path"
import type { Dirent } from "node:fs"
import type {
  CreateSkillRequest,
  Skill,
  SkillDraftRequest,
  SkillDraftResponse,
  SkillResourceKind,
  SkillSummary,
  SkillTextResource,
  UpdateSkillRequest,
} from "@/lib/types"
import { readBookFile, getBookFileMtime } from "@/lib/server/book-store"
import { callChatCompletion, getConfig } from "@/lib/server/llm"
import { getBookDir } from "@/lib/server/paths"

const SOURCE_FILE = "创作指南.md"
const SUMMARY_FILE = "skills/style_guide_summary.md"
const META_FILE = "skills/style_guide.skill.json"
const CLAUDE_SKILLS_DIR = ".claude/skills"

const SUMMARY_MAX_CHARS = 500
const MAX_RESOURCE_CHARS = 200_000
const RESOURCE_ROOTS: SkillResourceKind[] = ["references", "scripts", "assets"]

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

function parseSkillFrontmatter(content: string): Record<string, string> {
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

function isValidSkillName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64
}

function safeYamlValue(value: string): string {
  return JSON.stringify(value.replace(/\r?\n/g, " ").trim())
}

function normalizeResourceKinds(kinds: unknown): SkillResourceKind[] {
  if (!Array.isArray(kinds)) return []
  return RESOURCE_ROOTS.filter((kind) => kinds.includes(kind))
}

function normalizeResourcePath(rawPath: string): string {
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

function fallbackSkillName(nameHint: string): { name: string; warnings: string[] } {
  const normalized = normalizeSkillName(nameHint)
  if (normalized) return { name: normalized, warnings: [] }
  return {
    name: "novel-skill",
    warnings: ["名称无法自动转换成安全的英文短名，请手动确认 Skill 短名。"],
  }
}

function createTemplateSkillMd(name: string, input: SkillDraftRequest): string {
  const goal = input.goal.trim() || "说明这个 Skill 要沉淀哪一种可复用的小说写作能力。"
  const triggers = input.triggers.trim() || "当用户明确需要这套流程时使用。"
  const examples = input.examples.trim()
  const examplesBlock = examples
    ? `\n## 示例\n\n${examples}\n`
    : ""

  return `---
name: ${name}
description: ${safeYamlValue(goal)}
when_to_use: ${safeYamlValue(triggers)}
argument-hint: "[范围或参考材料]"
---

# ${name}

使用这个 Skill 来执行下面这套可复用流程：

${goal}

## 工作流程

1. 先确认用户这次想要的具体产出。
2. 判断是否需要读取相关书籍文件，不要凭空断言。
3. 结合项目设定、写作约束和必要参考资料处理。
4. 输出结果时保持简洁，需要时给出相关文件路径或下一步动作。
${examplesBlock}`
}

function createTemplateResources(kinds: SkillResourceKind[]): SkillTextResource[] {
  const resources: SkillTextResource[] = []
  if (kinds.includes("references")) {
    resources.push({
      path: "references/context.md",
      content: "# 参考资料\n\n把较长的规则、设定、示例或背景说明放在这里，避免 SKILL.md 过长。\n",
    })
  }
  if (kinds.includes("scripts")) {
    resources.push({
      path: "scripts/helper.js",
      content: "// 如果这个 Skill 需要可重复执行的文本处理逻辑，可以写在这里。\n",
    })
  }
  if (kinds.includes("assets")) {
    resources.push({
      path: "assets/template.txt",
      content: "这里可以放这个 Skill 会反复使用的文本模板或素材说明。\n",
    })
  }
  return resources
}

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const raw = fenced ? fenced[1].trim() : trimmed
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("没有找到 JSON 对象。")
  return JSON.parse(raw.slice(start, end + 1))
}

function normalizeDraftResponse(raw: unknown, fallbackName: string, fallback: SkillDraftResponse): SkillDraftResponse {
  const data = raw && typeof raw === "object" ? raw as Partial<SkillDraftResponse> : {}
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((item): item is string => typeof item === "string")
    : []
  const name = normalizeSkillName(typeof data.name === "string" ? data.name : fallbackName) || fallbackName
  const skillMd = typeof data.skillMd === "string" && data.skillMd.trim()
    ? data.skillMd.trimEnd() + "\n"
    : fallback.skillMd
  const rawResources = Array.isArray(data.resources) ? data.resources : []
  const resources: SkillTextResource[] = []

  for (const item of rawResources) {
    if (!item || typeof item !== "object") continue
    const resource = item as Partial<SkillTextResource>
    if (typeof resource.path !== "string" || typeof resource.content !== "string") continue
    try {
      resources.push({
        path: normalizeResourcePath(resource.path),
        content: resource.content,
      })
    } catch {
      warnings.push(`已跳过不合法的资源路径：${resource.path}`)
    }
  }

  try {
    validateSkillDraft({ name, skillMd, resources })
    return { name, skillMd, resources, warnings }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "生成的草稿没有通过校验。")
    return { ...fallback, warnings: [...fallback.warnings, ...warnings] }
  }
}

export async function draftClaudeSkill(input: SkillDraftRequest): Promise<SkillDraftResponse> {
  const resourceKinds = normalizeResourceKinds(input.resourceKinds)
  const { name, warnings } = fallbackSkillName(input.nameHint)
  const fallback: SkillDraftResponse = {
    name,
    skillMd: createTemplateSkillMd(name, input),
    resources: createTemplateResources(resourceKinds),
    warnings,
  }
  const config = getConfig()
  if (!config) {
    return {
      ...fallback,
      warnings: [...fallback.warnings, "当前没有配置可用模型，已先生成可编辑的模板草稿。"],
    }
  }

  try {
    const result = await callChatCompletion(config, [
      {
        role: "system",
        content: [
          "You create concise project-local Novel Guide skills for Chinese novel projects.",
          "Return only JSON with keys: name, skillMd, resources, warnings.",
          "The skill name must use lowercase English letters, digits, and hyphens only.",
          "SKILL.md must start with YAML frontmatter containing name and description.",
          "Allowed optional frontmatter keys: when_to_use, argument-hint, user-invocable, disable-model-invocation.",
          "Keep SKILL.md focused and under 120 lines. Move detailed material into resources.",
          "Resource paths must start with references/, scripts/, or assets/ and contain text content only.",
          "Use clear Simplified Chinese for user-facing SKILL.md body, descriptions, resource content, and warnings unless paths, keys, or code require English.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          nameHint: input.nameHint,
          safeName: name,
          goal: input.goal,
          triggers: input.triggers,
          examples: input.examples,
          resourceKinds,
        }, null, 2),
      },
    ], { temperature: 0.2, maxTokens: 2400 })

    return normalizeDraftResponse(extractJsonObject(result.content), name, fallback)
  } catch (error) {
    return {
      ...fallback,
      warnings: [
        ...fallback.warnings,
        error instanceof Error ? `模型生成草稿失败：${error.message}` : "模型生成草稿失败。",
      ],
    }
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
