import fs from "fs/promises"
import path from "path"
import type { Dirent } from "node:fs"
import type {
  CreateSkillRequest,
  LedgerEntry,
  Skill,
  SkillDraftResponse,
  SkillLabMeta,
  SkillLabStage,
  SkillSummary,
  SkillTrial,
  SkillTextResource,
  SkillUsageStats,
  UpdateSkillRequest,
} from "@/lib/types"
import { readBookFile, getBookFileMtime } from "@/lib/server/book-store"
import { listLedgerEntries } from "@/lib/server/ledger"
import { getBookDir } from "@/lib/server/paths"
import { rebuildBookIndexes } from "@/lib/server/book-index"
import {
  LEGACY_WORKSPACE_SKILLS_DIR,
  WORKSPACE_SKILLS_DIR,
  WORKSPACE_SKILL_SOURCE,
  isWorkspaceSkillSource,
} from "@/lib/workspace-layout"
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

const SOURCE_FILE = "剧情设计指南.md"
const META_FILE = "skills/plot_design.skill.json"
const SKILL_LAB_FILE = "skill-lab.json"

const USAGE_LEDGER_SCAN_LIMIT = 1000

// ─── Paths ────────────────────────────────────────────────────

function metaPath(bookId: string): string {
  return path.join(getBookDir(bookId), META_FILE)
}

function skillLabPath(bookId: string): string {
  return path.join(getBookDir(bookId), SKILL_LAB_FILE)
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 1.5)
}

function toRelativePath(...parts: string[]): string {
  return parts.filter(Boolean).join("/")
}

function workspaceSkillsRoot(bookId: string): string {
  return path.join(getBookDir(bookId), WORKSPACE_SKILLS_DIR)
}

function legacyWorkspaceSkillsRoot(bookId: string): string {
  return path.join(getBookDir(bookId), LEGACY_WORKSPACE_SKILLS_DIR)
}

function workspaceSkillDir(bookId: string, name: string): string {
  return path.join(workspaceSkillsRoot(bookId), name)
}

function legacyWorkspaceSkillDir(bookId: string, name: string): string {
  return path.join(legacyWorkspaceSkillsRoot(bookId), name)
}

async function resolveExistingWorkspaceSkillDir(bookId: string, name: string): Promise<string | null> {
  const modernDir = workspaceSkillDir(bookId, name)
  if (await fileExists(path.join(modernDir, "SKILL.md"))) return modernDir

  const legacyDir = legacyWorkspaceSkillDir(bookId, name)
  if (await fileExists(path.join(legacyDir, "SKILL.md"))) return legacyDir

  return null
}

function emptyUsage(): SkillUsageStats {
  return {
    timesUsed: 0,
    timesRewritten: 0,
    rewriteRate: 0,
    recentRewrites: [],
  }
}

function normalizeTrial(value: unknown): SkillTrial | null {
  if (!value || typeof value !== "object") return null
  const trial = value as Partial<SkillTrial>
  if (
    typeof trial.id !== "string" ||
    typeof trial.skillName !== "string" ||
    typeof trial.sampleText !== "string" ||
    typeof trial.outputWithout !== "string" ||
    typeof trial.outputWith !== "string" ||
    typeof trial.createdAt !== "string"
  ) {
    return null
  }
  return {
    id: trial.id,
    skillName: trial.skillName,
    sampleSource: trial.sampleSource === "ledger" || trial.sampleSource === "editor" ? trial.sampleSource : "paste",
    sampleText: trial.sampleText,
    outputWithout: trial.outputWithout,
    outputWith: trial.outputWith,
    verdict: trial.verdict === "helped" || trial.verdict === "no_diff" || trial.verdict === "hurt" ? trial.verdict : null,
    judgeNote: typeof trial.judgeNote === "string" ? trial.judgeNote : undefined,
    createdAt: trial.createdAt,
  }
}

function normalizeLabStage(value: unknown): SkillLabStage {
  return value === "experimental" ? "experimental" : "active"
}

function normalizeSkillLabMeta(name: string, value: unknown): SkillLabMeta {
  const meta = value && typeof value === "object" ? value as Partial<SkillLabMeta> : {}
  return {
    name,
    stage: normalizeLabStage(meta.stage),
    originObservationId: typeof meta.originObservationId === "string" ? meta.originObservationId : undefined,
    originExperimentId: typeof meta.originExperimentId === "string" ? meta.originExperimentId : undefined,
    trials: Array.isArray(meta.trials) ? meta.trials.map(normalizeTrial).filter((trial): trial is SkillTrial => trial !== null) : [],
  }
}

type SkillLabSidecar = {
  skillMeta?: Record<string, unknown>
  [key: string]: unknown
}

async function readSkillLabSidecar(bookId: string): Promise<SkillLabSidecar> {
  try {
    const raw = await fs.readFile(skillLabPath(bookId), "utf-8")
    const data = JSON.parse(raw)
    return data && typeof data === "object" ? data as SkillLabSidecar : {}
  } catch {
    return {}
  }
}

async function writeSkillLabSidecar(bookId: string, sidecar: SkillLabSidecar): Promise<void> {
  const filePath = skillLabPath(bookId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(sidecar, null, 2), "utf-8")
}

export async function readSkillLabMetaMap(bookId: string): Promise<Record<string, SkillLabMeta>> {
  const sidecar = await readSkillLabSidecar(bookId)
  const rawMeta = sidecar.skillMeta && typeof sidecar.skillMeta === "object" ? sidecar.skillMeta : {}
  const meta: Record<string, SkillLabMeta> = {}
  for (const [name, value] of Object.entries(rawMeta)) {
    meta[name] = normalizeSkillLabMeta(name, value)
  }
  return meta
}

async function writeSkillLabMetaMap(bookId: string, meta: Record<string, SkillLabMeta>): Promise<void> {
  const sidecar = await readSkillLabSidecar(bookId)
  sidecar.skillMeta = meta
  await writeSkillLabSidecar(bookId, sidecar)
}

export async function upsertSkillLabMeta(
  bookId: string,
  skillName: string,
  patch: Partial<SkillLabMeta>,
): Promise<SkillLabMeta> {
  const name = normalizeSkillName(skillName)
  if (!name || !isValidSkillName(name)) {
    throw new SkillValidationError("Skill 短名只能使用小写英文字母、数字和连字符。")
  }
  const meta = await readSkillLabMetaMap(bookId)
  const current = meta[name] ?? normalizeSkillLabMeta(name, null)
  const next: SkillLabMeta = {
    ...current,
    ...patch,
    name,
    stage: normalizeLabStage(patch.stage ?? current.stage),
    trials: patch.trials ?? current.trials,
  }
  meta[name] = next
  await writeSkillLabMetaMap(bookId, meta)
  return next
}

export async function appendSkillTrial(bookId: string, skillName: string, trial: SkillTrial): Promise<SkillTrial> {
  const name = normalizeSkillName(skillName)
  if (!name || !isValidSkillName(name)) {
    throw new SkillValidationError("Skill 短名只能使用小写英文字母、数字和连字符。")
  }
  const meta = await readSkillLabMetaMap(bookId)
  const current = meta[name] ?? normalizeSkillLabMeta(name, null)
  meta[name] = {
    ...current,
    name,
    trials: [trial, ...current.trials].slice(0, 20),
  }
  await writeSkillLabMetaMap(bookId, meta)
  return trial
}

export async function setSkillTrialVerdict(
  bookId: string,
  trialId: string,
  verdict: SkillTrial["verdict"],
  judgeNote?: string,
): Promise<SkillTrial> {
  const meta = await readSkillLabMetaMap(bookId)
  for (const [name, item] of Object.entries(meta)) {
    const trialIndex = item.trials.findIndex((trial) => trial.id === trialId)
    if (trialIndex < 0) continue
    const trial = {
      ...item.trials[trialIndex],
      verdict,
      judgeNote: judgeNote?.trim() || item.trials[trialIndex].judgeNote,
    }
    const trials = [...item.trials]
    trials[trialIndex] = trial
    meta[name] = { ...item, trials }
    await writeSkillLabMetaMap(bookId, meta)
    return trial
  }
  throw new SkillNotFoundError("找不到这次 A/B 探针记录。")
}

async function renameSkillLabMeta(bookId: string, fromName: string, toName: string): Promise<void> {
  if (fromName === toName) return
  const meta = await readSkillLabMetaMap(bookId)
  const current = meta[fromName]
  if (!current) return
  delete meta[fromName]
  meta[toName] = {
    ...current,
    name: toName,
    trials: current.trials.map((trial) => ({ ...trial, skillName: toName })),
  }
  await writeSkillLabMetaMap(bookId, meta)
}

async function deleteSkillLabMeta(bookId: string, skillName: string): Promise<void> {
  const meta = await readSkillLabMetaMap(bookId)
  if (!meta[skillName]) return
  delete meta[skillName]
  await writeSkillLabMetaMap(bookId, meta)
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

function toWorkspaceSkillRecord(
  bookId: string,
  directoryName: string,
  skillMd: string,
  meta: Record<string, string>,
  mtimeIso: string,
  sourceDir = WORKSPACE_SKILLS_DIR,
): Skill {
  return {
    id: `workspace-skill-${directoryName}`,
    type: "workspace_skill",
    name: meta.name || directoryName,
    description: meta.description || meta.when_to_use || "",
    scope: "book",
    bookId,
    sourceFile: toRelativePath(sourceDir, directoryName, "SKILL.md"),
    summaryTokenCount: estimateTokens(skillMd),
    lastSourceModified: mtimeIso,
    lastSummaryGenerated: mtimeIso,
    dirty: false,
    source: WORKSPACE_SKILL_SOURCE,
  }
}

async function writeWorkspaceSkillContents(
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

export async function createWorkspaceSkill(bookId: string, input: CreateSkillRequest): Promise<Skill> {
  const { name, skillMd, resources, meta } = validateSkillDraft(input)
  const skillsDir = workspaceSkillsRoot(bookId)
  const targetDir = workspaceSkillDir(bookId, name)

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
    await writeWorkspaceSkillContents(targetDir, skillMd, resources)
    await touchBookUpdatedAt(bookId)
    await rebuildBookIndexes(bookId).catch(() => {})
  } catch (error) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  const stat = await fs.stat(path.join(targetDir, "SKILL.md"))
  const skill = toWorkspaceSkillRecord(bookId, name, skillMd, meta, stat.mtime.toISOString())
  await upsertSkillLabMeta(bookId, name, { stage: "active" }).catch(() => {})
  return { ...skill, stage: "active", usage: emptyUsage(), trials: [] }
}

export async function readWorkspaceSkillDraft(bookId: string, rawName: string): Promise<SkillDraftResponse> {
  const name = normalizeSkillName(rawName)
  if (!name || !isValidSkillName(name)) {
    throw new SkillValidationError("Skill 短名只能使用小写英文字母、数字和连字符。")
  }

  const targetDir = await resolveExistingWorkspaceSkillDir(bookId, name)
  if (!targetDir) {
    throw new SkillNotFoundError(`找不到这个 Skill：${name}`)
  }

  const skillPath = path.join(targetDir, "SKILL.md")
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

export async function updateWorkspaceSkill(bookId: string, input: UpdateSkillRequest): Promise<Skill> {
  const originalName = normalizeSkillName(input.originalName)
  if (!originalName || !isValidSkillName(originalName)) {
    throw new SkillValidationError("原 Skill 短名只能使用小写英文字母、数字和连字符。")
  }

  const { name, skillMd, resources, meta } = validateSkillDraft(input)
  const originalDir = await resolveExistingWorkspaceSkillDir(bookId, originalName)
  if (!originalDir) {
    throw new SkillNotFoundError(`找不到这个 Skill：${originalName}`)
  }

  const originalRoot = path.dirname(originalDir)
  const targetRoot = originalRoot === legacyWorkspaceSkillsRoot(bookId)
    ? legacyWorkspaceSkillsRoot(bookId)
    : workspaceSkillsRoot(bookId)
  const targetDir = path.join(targetRoot, name)

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
    await writeWorkspaceSkillContents(activeDir, skillMd, resources)
    await touchBookUpdatedAt(bookId)
    await rebuildBookIndexes(bookId).catch(() => {})
  } catch (error) {
    if (renamed && !(await dirExists(originalDir)) && await dirExists(targetDir)) {
      await fs.rename(targetDir, originalDir).catch(() => {})
    }
    throw error
  }

  const stat = await fs.stat(path.join(activeDir, "SKILL.md"))
  const sourceDir = originalRoot === legacyWorkspaceSkillsRoot(bookId)
    ? LEGACY_WORKSPACE_SKILLS_DIR
    : WORKSPACE_SKILLS_DIR
  await renameSkillLabMeta(bookId, originalName, name).catch(() => {})
  return toWorkspaceSkillRecord(bookId, name, skillMd, meta, stat.mtime.toISOString(), sourceDir)
}

export async function deleteWorkspaceSkill(bookId: string, rawName: string): Promise<void> {
  const name = normalizeSkillName(rawName)
  if (!name || !isValidSkillName(name)) {
    throw new SkillValidationError("Skill 短名只能使用小写英文字母、数字和连字符。")
  }

  const targetDir = await resolveExistingWorkspaceSkillDir(bookId, name)
  if (!targetDir) {
    throw new SkillNotFoundError(`找不到这个 Skill：${name}`)
  }

  await fs.rm(targetDir, { recursive: true, force: true })
  await deleteSkillLabMeta(bookId, name).catch(() => {})
  await touchBookUpdatedAt(bookId)
  await rebuildBookIndexes(bookId).catch(() => {})
}

function normalizePlotDesignSkill(bookId: string, skill: Skill, dirty: boolean): Skill {
  return {
    ...skill,
    id: `skill-plot-design-${bookId}`,
    type: "plot_design",
    name: skill.name || "剧情设计指南",
    description: skill.description || "剧情主线、关卡、冲突、悬念和切入点的压缩层",
    scope: "book",
    bookId,
    sourceFile: SOURCE_FILE,
    source: "plot_design",
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

async function collectUsageLedgerEntries(bookId: string): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = []
  let cursor: string | undefined
  do {
    const page = await listLedgerEntries(bookId, { limit: 200, cursor }).catch(() => ({ entries: [] as LedgerEntry[], nextCursor: undefined }))
    entries.push(...page.entries)
    cursor = page.nextCursor
  } while (cursor && entries.length < USAGE_LEDGER_SCAN_LIMIT)

  return entries
    .slice(0, USAGE_LEDGER_SCAN_LIMIT)
    .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""))
}

function ensureUsage(map: Map<string, SkillUsageStats>, skillId: string): SkillUsageStats {
  const current = map.get(skillId)
  if (current) return current
  const next = emptyUsage()
  map.set(skillId, next)
  return next
}

export async function collectSkillUsageStats(bookId: string): Promise<Map<string, SkillUsageStats>> {
  const entries = await collectUsageLedgerEntries(bookId)
  const stats = new Map<string, SkillUsageStats>()
  const pendingByPath = new Map<string, { skillIds: string[]; entry: LedgerEntry }>()

  for (const entry of entries) {
    if (!entry.targetPath) continue

    if (entry.actor === "agent" && Array.isArray(entry.activeSkillIds) && entry.activeSkillIds.length > 0) {
      const skillIds = [...new Set(entry.activeSkillIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
      if (skillIds.length === 0) continue
      for (const skillId of skillIds) {
        ensureUsage(stats, skillId).timesUsed += 1
      }
      pendingByPath.set(entry.targetPath, { skillIds, entry })
      continue
    }

    if (entry.actor !== "user") continue
    const pending = pendingByPath.get(entry.targetPath)
    if (!pending) continue

    for (const skillId of pending.skillIds) {
      const usage = ensureUsage(stats, skillId)
      usage.timesRewritten += 1
      usage.recentRewrites.unshift({
        ledgerEntryId: entry.id,
        targetPath: entry.targetPath,
        note: entry.summary || `用户随后改写了 ${entry.targetPath}`,
      })
      usage.recentRewrites = usage.recentRewrites.slice(0, 5)
    }
    pendingByPath.delete(entry.targetPath)
  }

  for (const usage of stats.values()) {
    usage.rewriteRate = usage.timesUsed > 0
      ? Number((usage.timesRewritten / usage.timesUsed).toFixed(2))
      : 0
  }

  return stats
}

// ─── Public API ───────────────────────────────────────────────

export async function getPlotDesignSkill(bookId: string): Promise<Skill> {
  let skill = await readMeta(bookId)

  // check if source file is newer
  const sourceMtime = await getBookFileMtime(bookId, SOURCE_FILE)
  const dirty = !skill || sourceMtime > skill.lastSourceModified

  if (!skill) {
    skill = {
      id: `skill-plot-design-${bookId}`,
      type: "plot_design",
      name: "剧情设计指南",
      description: "剧情主线、关卡、冲突、悬念和切入点的压缩层",
      scope: "book",
      bookId,
      sourceFile: SOURCE_FILE,
      summaryTokenCount: 0,
      lastSourceModified: sourceMtime,
      lastSummaryGenerated: "",
      dirty,
      source: "plot_design",
    }
  } else {
    skill = normalizePlotDesignSkill(bookId, skill, dirty)
  }

  return skill
}

async function listWorkspaceSkills(bookId: string): Promise<Skill[]> {
  const bookDir = getBookDir(bookId)
  const [metaMap, usageMap] = await Promise.all([
    readSkillLabMetaMap(bookId).catch(() => ({} as Record<string, SkillLabMeta>)),
    collectSkillUsageStats(bookId).catch(() => new Map<string, SkillUsageStats>()),
  ])
  const skills: Skill[] = []
  const seen = new Set<string>()

  for (const sourceDir of [WORKSPACE_SKILLS_DIR, LEGACY_WORKSPACE_SKILLS_DIR]) {
    const skillsDir = path.join(bookDir, sourceDir)
    let entries: Dirent<string>[]

    try {
      entries = await fs.readdir(skillsDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue

      const sourceFile = toRelativePath(sourceDir, entry.name, "SKILL.md")
      const sourceAbs = path.join(bookDir, sourceFile)
      try {
        const [content, stat] = await Promise.all([
          fs.readFile(sourceAbs, "utf-8"),
          fs.stat(sourceAbs),
        ])
        const meta = parseSkillFrontmatter(content)
        const skill = toWorkspaceSkillRecord(bookId, entry.name, content, meta, stat.mtime.toISOString(), sourceDir)
        const labMeta = metaMap[entry.name] ?? normalizeSkillLabMeta(entry.name, null)
        skills.push({
          ...skill,
          stage: labMeta.stage,
          originObservationId: labMeta.originObservationId,
          originExperimentId: labMeta.originExperimentId,
          usage: usageMap.get(skill.id) ?? emptyUsage(),
          trials: labMeta.trials,
        })
        seen.add(entry.name)
      } catch {
        // Ignore malformed skill directories.
      }
    }
  }

  return skills.sort((a, b) => skillDisplaySortKey(a).localeCompare(skillDisplaySortKey(b), "zh-CN"))
}

function skillDisplaySortKey(skill: Skill): string {
  return skill.name ?? skill.id
}

export async function listSkills(bookId: string): Promise<Skill[]> {
  const skill = await getPlotDesignSkill(bookId)
  const workspaceSkills = await listWorkspaceSkills(bookId)
  return [skill, ...workspaceSkills]
}

export async function promoteSkill(bookId: string, rawName: string): Promise<Skill> {
  const name = normalizeSkillName(rawName)
  if (!name || !isValidSkillName(name)) {
    throw new SkillValidationError("Skill 短名只能使用小写英文字母、数字和连字符。")
  }
  const targetDir = await resolveExistingWorkspaceSkillDir(bookId, name)
  if (!targetDir) {
    throw new SkillNotFoundError(`找不到这个 Skill：${name}`)
  }
  await upsertSkillLabMeta(bookId, name, { stage: "active" })
  const skills = await listSkills(bookId)
  const sourceDir = path.dirname(targetDir) === legacyWorkspaceSkillsRoot(bookId)
    ? LEGACY_WORKSPACE_SKILLS_DIR
    : WORKSPACE_SKILLS_DIR
  const skill = skills.find((item) => item.sourceFile.replace(/\\/g, "/") === toRelativePath(sourceDir, name, "SKILL.md"))
  if (!skill) throw new SkillNotFoundError(`找不到这个 Skill：${name}`)
  return skill
}

export async function resolveSkillSummaries(bookId: string, skillIds: string[]): Promise<SkillSummary[]> {
  const wantedIds = new Set(skillIds)
  if (wantedIds.size === 0) return []

  const skills = await listSkills(bookId)
  const summaries: SkillSummary[] = []
  for (const skill of skills) {
    if (!wantedIds.has(skill.id)) continue

    const summary = await readBookFile(bookId, skill.sourceFile) ?? ""

    summaries.push({
      skill,
      summary,
      refreshable: false,
    })
  }

  return summaries
}
