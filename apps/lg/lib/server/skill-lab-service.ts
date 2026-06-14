import fs from "fs/promises"
import path from "path"
import type {
  LedgerEntry,
  Skill,
  SkillExperimentSaveRequest,
  SkillLabAnalyzeRequest,
  SkillLabMeta,
  SkillLabResponse,
  SkillSuggestion,
  SkillSuggestionEvidence,
  SkillSuggestionKind,
  SkillSuggestionStatus,
} from "@/lib/types"
import { getLedgerEntry } from "@/lib/server/ledger"
import { createWorkspaceSkill, listSkills, upsertSkillLabMeta } from "@/lib/server/skill-service"
import { readBookFile } from "@/lib/server/book-store"
import { callChatCompletion, getConfig } from "@/lib/server/llm"
import { parseJsonFromModel } from "@/lib/server/llm-json"
import { draftWorkspaceSkill } from "@/lib/server/skill-draft-service"
import { normalizeSkillName } from "@/lib/server/skill-validation"
import { nowIso } from "@/lib/server/ids"
import { getBookDir } from "@/lib/server/paths"
import { LEGACY_WORKSPACE_SKILLS_DIR, WORKSPACE_SKILLS_DIR } from "@/lib/workspace-layout"

const LAB_FILE = "skill-lab.json"
const MIN_SELECTED_REVISIONS = 2
const MAX_SELECTED_REVISIONS = 12
const MAX_TOTAL_DIFF_CHARS = 12000
const MAX_DIFF_CHARS = 2000
const MAX_SKILL_BODY_CHARS = 800
const MAX_SUGGESTIONS = 5

type LabStore = {
  suggestions: SkillSuggestion[]
  skillMeta: Record<string, SkillLabMeta>
  analyzedAt: string
  analyzedRevisionCount: number
}

export class SkillLabInputError extends Error {}

// ─── Store I/O ────────────────────────────────────────────────

function labPath(bookId: string): string {
  return path.join(getBookDir(bookId), LAB_FILE)
}

function isSuggestion(value: unknown): value is SkillSuggestion {
  if (!value || typeof value !== "object") return false
  const s = value as Partial<SkillSuggestion>
  return (
    typeof s.id === "string" &&
    (s.kind === "new" || s.kind === "improve") &&
    typeof s.title === "string" &&
    Array.isArray(s.evidence)
  )
}

function normalizeStatus(value: unknown): SkillSuggestionStatus {
  if (
    value === "surfacing" ||
    value === "confirmed" ||
    value === "incubated" ||
    value === "dismissed" ||
    value === "drafted" ||
    value === "applied"
  ) {
    return value
  }
  return "surfacing"
}

function normalizeOrigin(value: unknown): SkillSuggestion["origin"] {
  if (value === "user_explore" || value === "manual") return value
  return "ai_diff"
}

function normalizeStoredSuggestion(value: unknown): SkillSuggestion | null {
  if (!isSuggestion(value)) return null
  const confidence = normalizeScore(typeof value.confidence === "number" ? value.confidence : 0.5)
  return {
    ...value,
    status: normalizeStatus(value.status),
    confidence,
    strength: normalizeScore(typeof value.strength === "number" ? value.strength : confidence),
    seenInAnalyses: Math.max(1, Math.trunc(typeof value.seenInAnalyses === "number" ? value.seenInAnalyses : 1)),
    origin: normalizeOrigin(value.origin),
  }
}

function normalizeSkillLabMeta(name: string, value: unknown): SkillLabMeta {
  const meta = value && typeof value === "object" ? value as Partial<SkillLabMeta> : {}
  return {
    name,
    stage: meta.stage === "experimental" ? "experimental" : "active",
    originObservationId: typeof meta.originObservationId === "string" ? meta.originObservationId : undefined,
    originExperimentId: typeof meta.originExperimentId === "string" ? meta.originExperimentId : undefined,
    trials: Array.isArray(meta.trials) ? meta.trials.filter((trial) => trial && typeof trial === "object") as SkillLabMeta["trials"] : [],
  }
}

async function readStore(bookId: string): Promise<LabStore> {
  try {
    const raw = await fs.readFile(labPath(bookId), "utf-8")
    const data = JSON.parse(raw) as Partial<LabStore>
    const rawSkillMeta = data.skillMeta && typeof data.skillMeta === "object" ? data.skillMeta : {}
    const skillMeta: Record<string, SkillLabMeta> = {}
    for (const [name, value] of Object.entries(rawSkillMeta)) {
      skillMeta[name] = normalizeSkillLabMeta(name, value)
    }
    return {
      suggestions: Array.isArray(data.suggestions)
        ? data.suggestions.map(normalizeStoredSuggestion).filter((item): item is SkillSuggestion => item !== null)
        : [],
      skillMeta,
      analyzedAt: typeof data.analyzedAt === "string" ? data.analyzedAt : "",
      analyzedRevisionCount: typeof data.analyzedRevisionCount === "number" ? data.analyzedRevisionCount : 0,
    }
  } catch {
    return { suggestions: [], skillMeta: {}, analyzedAt: "", analyzedRevisionCount: 0 }
  }
}

async function writeStore(bookId: string, store: LabStore): Promise<LabStore> {
  const filePath = labPath(bookId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8")
  return store
}

function toResponse(store: LabStore, modelConfigured: boolean): SkillLabResponse {
  return {
    suggestions: [...store.suggestions].sort(compareSuggestions),
    analyzedAt: store.analyzedAt,
    analyzedRevisionCount: store.analyzedRevisionCount,
    modelConfigured,
  }
}

function statusOrder(status: SkillSuggestionStatus): number {
  if (status === "surfacing" || status === "open") return 0
  if (status === "confirmed") return 1
  if (status === "incubated") return 2
  if (status === "drafted") return 1
  if (status === "applied") return 2
  return 3
}

function compareSuggestions(a: SkillSuggestion, b: SkillSuggestion): number {
  if (a.status !== b.status) return statusOrder(a.status) - statusOrder(b.status)
  return b.strength - a.strength || b.seenInAnalyses - a.seenInAnalyses || b.updatedAt.localeCompare(a.updatedAt)
}

// ─── Helpers ──────────────────────────────────────────────────

function clipText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength).trim()}…` : trimmed
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0.1, Math.min(0.98, Number(value.toFixed(2))))
}

function skillDirFromSourceFile(sourceFile: string): string | null {
  const normalized = sourceFile.replace(/\\/g, "/")
  for (const skillsDir of [WORKSPACE_SKILLS_DIR, LEGACY_WORKSPACE_SKILLS_DIR]) {
    const prefix = `${skillsDir}/`
    if (!normalized.startsWith(prefix) || !normalized.endsWith("/SKILL.md")) continue

    const directoryName = normalized.slice(prefix.length, -"/SKILL.md".length)
    if (directoryName && !directoryName.includes("/")) return directoryName
  }
  return null
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 48)
}

function normalizeAnalyzeInput(input: SkillLabAnalyzeRequest): { ledgerEntryIds: string[]; focus: string } {
  if (!Array.isArray(input.ledgerEntryIds)) {
    throw new SkillLabInputError("请选择至少 2 条改稿样本。")
  }

  const ledgerEntryIds = [...new Set(
    input.ledgerEntryIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean),
  )]
  if (ledgerEntryIds.length < MIN_SELECTED_REVISIONS) {
    throw new SkillLabInputError("至少选择 2 条改稿样本。")
  }
  if (ledgerEntryIds.length > MAX_SELECTED_REVISIONS) {
    throw new SkillLabInputError(`一次最多选择 ${MAX_SELECTED_REVISIONS} 条改稿样本。`)
  }

  return {
    ledgerEntryIds,
    focus: typeof input.focus === "string" ? clipText(input.focus, 500) : "",
  }
}

function isAnalyzableRevision(entry: LedgerEntry | null): entry is LedgerEntry {
  return Boolean(
    entry &&
    typeof entry.diffPatch === "string" &&
    entry.diffPatch.trim() &&
    entry.targetPath &&
    entry.targetPath !== "ledger.jsonl",
  )
}

// ─── Gather inputs ────────────────────────────────────────────

async function collectSelectedRevisions(bookId: string, ledgerEntryIds: string[]): Promise<LedgerEntry[]> {
  const revisions = (await Promise.all(
    ledgerEntryIds.map((entryId) => getLedgerEntry(bookId, entryId).catch(() => null)),
  )).filter(isAnalyzableRevision)

  if (revisions.length < MIN_SELECTED_REVISIONS) {
    throw new SkillLabInputError("可分析的改稿样本不足 2 条。请选择带 diff 的改稿记录。")
  }

  const totalDiffChars = revisions.reduce((sum, entry) => sum + (entry.diffPatch?.length ?? 0), 0)
  if (totalDiffChars > MAX_TOTAL_DIFF_CHARS) {
    throw new SkillLabInputError(`选中的 diff 约 ${totalDiffChars} 字符，已超过 ${MAX_TOTAL_DIFF_CHARS} 字符预算。请缩小范围。`)
  }

  return revisions
}

type ExistingSkill = { name: string; title: string; description: string; body: string }

async function collectExistingSkills(bookId: string): Promise<ExistingSkill[]> {
  const skills = await listSkills(bookId).catch(() => [] as Skill[])
  const result: ExistingSkill[] = []
  for (const skill of skills) {
    if (skill.source !== "workspace_skill") continue
    const name = skillDirFromSourceFile(skill.sourceFile)
    if (!name) continue
    const body = (await readBookFile(bookId, skill.sourceFile)) ?? ""
    result.push({
      name,
      title: skill.name || name,
      description: skill.description ?? "",
      body: clipText(body, MAX_SKILL_BODY_CHARS),
    })
  }
  return result
}

// ─── Prompt + parsing ─────────────────────────────────────────

const SYSTEM_PROMPT = [
  "你在帮一位中文网文作者，从他主动选择的真实使用样本里提炼“值得拿去试验台打磨”的写作线索。",
  "线索不是 Skill。线索只是一条候选指令或改进假设，必须由用户拿去试验台 A/B 后，才可能保存成实验 Skill。",
  "",
  "你会拿到：",
  "- SELECTED_REVISIONS：用户主动挑选的真实改动 diff，每条带一个 id。",
  "- FOCUS：用户这次想找的规律或想验证的假设。为空时，按样本本身找可靠规律。",
  "- EXISTING_SKILLS：已经建好的 Skill，含 name（目录名）、title、description、正文摘录。",
  "",
  "请优先围绕 FOCUS 找出在多条样本里【反复出现】、且值得试验的 craft 规律；FOCUS 为空时，从样本本身归纳。不要拿一次性的剧情/操作指令凑数。",
  '- kind="new"：作者反复在做、但现有 Skill 没覆盖的可试验写法。给 proposedName（小写英文+连字符）、title（中文）、observation（你观察到的具体规律）、proposedRules（2-4 条可直接送进试验台的中文规则）。',
  '- kind="improve"：某个现有 Skill 的规则与样本冲突，或没覆盖样本暴露出的情况。把 targetSkillName 设为【完全一致】的现有 Skill name，给 observation（差距在哪）、proposedChange（试验台里的 B 版指令应该怎么改，中文、具体）。',
  "",
  "每条线索必须引用 2 条以上证据，每条证据引用一个真实的 SELECTED_REVISIONS id，并用一句话说明这条样本体现了什么。不要编造 id。",
  "宁可少给也不要给空泛或牵强的线索。最多 5 条。如果没有可靠线索，返回空数组。",
  "",
  '只返回 JSON：{ "suggestions": [ { "kind", "title", "observation", "confidence"(0~1), "evidence": [{ "ledgerEntryId", "note" }], "proposedName"?, "proposedRules"?, "targetSkillName"?, "proposedChange"? } ] }',
  "除 name/id 外，所有面向人的文字用简体中文。",
].join("\n")

function buildUserPayload(revisions: LedgerEntry[], skills: ExistingSkill[], focus: string): string {
  return JSON.stringify(
    {
      FOCUS: focus,
      SELECTED_REVISIONS: revisions.map((entry) => ({
        id: entry.id,
        path: entry.targetPath,
        summary: entry.summary,
        diff: clipText(entry.diffPatch ?? "", MAX_DIFF_CHARS),
      })),
      EXISTING_SKILLS: skills.map((skill) => ({
        name: skill.name,
        title: skill.title,
        description: skill.description,
        body: skill.body,
      })),
    },
    null,
    2,
  )
}

function normalizeSuggestions(
  raw: unknown,
  revisionsById: Map<string, LedgerEntry>,
  existingNames: Set<string>,
): SkillSuggestion[] {
  const data = raw && typeof raw === "object" ? (raw as { suggestions?: unknown }) : {}
  const list = Array.isArray(data.suggestions) ? data.suggestions : []
  const ts = nowIso()
  const out: SkillSuggestion[] = []
  const seen = new Set<string>()

  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const s = item as Record<string, unknown>
    const kind = s.kind === "improve" ? "improve" : s.kind === "new" ? "new" : null
    if (!kind) continue

    const title = typeof s.title === "string" ? s.title.trim() : ""
    const observation = typeof s.observation === "string" ? s.observation.trim() : ""
    if (!title || !observation) continue

    const evidence = normalizeEvidence(s.evidence, revisionsById)
    if (evidence.length === 0) continue

    const confidence = normalizeScore(typeof s.confidence === "number" ? s.confidence : 0.5)
    const base = {
      kind: kind as SkillSuggestionKind,
      title,
      observation,
      confidence,
      strength: confidence,
      seenInAnalyses: 1,
      origin: "ai_diff" as const,
      evidence,
      createdAt: ts,
      updatedAt: ts,
    }

    if (kind === "new") {
      const proposedName = normalizeSkillName(typeof s.proposedName === "string" ? s.proposedName : "")
      const proposedRules = toStringArray(s.proposedRules)
      if (!proposedName || proposedRules.length === 0) continue
      const id = `new:${proposedName}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, status: "surfacing", proposedName, proposedRules, ...base })
    } else {
      const targetSkillName = normalizeSkillName(typeof s.targetSkillName === "string" ? s.targetSkillName : "")
      const proposedChange = typeof s.proposedChange === "string" ? s.proposedChange.trim() : ""
      if (!targetSkillName || !existingNames.has(targetSkillName) || !proposedChange) continue
      const id = `improve:${targetSkillName}:${slug(title)}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        status: "surfacing",
        targetSkillName,
        targetSkillTitle: title,
        proposedChange,
        ...base,
      })
    }
    if (out.length >= MAX_SUGGESTIONS) break
  }

  return out
}

function normalizeEvidence(raw: unknown, revisionsById: Map<string, LedgerEntry>): SkillSuggestionEvidence[] {
  if (!Array.isArray(raw)) return []
  const result: SkillSuggestionEvidence[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const e = item as Record<string, unknown>
    const ledgerEntryId = typeof e.ledgerEntryId === "string" ? e.ledgerEntryId : ""
    const entry = revisionsById.get(ledgerEntryId)
    if (!entry || seen.has(ledgerEntryId)) continue
    seen.add(ledgerEntryId)
    result.push({
      ledgerEntryId,
      targetPath: entry.targetPath,
      note: typeof e.note === "string" ? e.note.trim() : entry.summary,
    })
  }
  return result
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

// ─── Merge fresh analysis with stored state ───────────────────

function mergeEvidence(
  previous: SkillSuggestionEvidence[],
  fresh: SkillSuggestionEvidence[],
): { evidence: SkillSuggestionEvidence[]; added: number } {
  const seen = new Set<string>()
  const evidence: SkillSuggestionEvidence[] = []
  let added = 0

  for (const item of [...previous, ...fresh]) {
    const key = `${item.ledgerEntryId}:${item.note}`
    if (seen.has(key)) continue
    seen.add(key)
    evidence.push(item)
    if (fresh.includes(item) && !previous.some((prev) => `${prev.ledgerEntryId}:${prev.note}` === key)) {
      added += 1
    }
  }

  return { evidence: evidence.slice(0, 16), added }
}

function growStrength(prev: SkillSuggestion | undefined, fresh: SkillSuggestion, addedEvidence: number): number {
  const base = prev ? Math.max(prev.strength, fresh.strength) : fresh.strength
  const recurrenceBoost = prev ? 0.08 : 0
  const evidenceBoost = Math.min(0.12, addedEvidence * 0.04)
  return normalizeScore(base + recurrenceBoost + evidenceBoost)
}

function mergeSuggestions(previous: SkillSuggestion[], fresh: SkillSuggestion[]): SkillSuggestion[] {
  const ts = nowIso()
  const prevById = new Map(previous.map((s) => [s.id, s]))
  const result = new Map<string, SkillSuggestion>()

  for (const prev of previous) {
    result.set(prev.id, prev)
  }

  for (const item of fresh) {
    const prev = prevById.get(item.id)
    const mergedEvidence = mergeEvidence(prev?.evidence ?? [], item.evidence)
    const status = prev?.status === "incubated" || prev?.status === "confirmed"
      ? prev.status
      : "surfacing"
    result.set(item.id, {
      ...item,
      status,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
      strength: growStrength(prev, item, mergedEvidence.added),
      confidence: Math.max(prev?.confidence ?? 0, item.confidence),
      seenInAnalyses: (prev?.seenInAnalyses ?? 0) + 1,
      evidence: mergedEvidence.evidence,
      incubatedSkillName: prev?.incubatedSkillName,
    })
  }

  return [...result.values()].sort(compareSuggestions)
}

// ─── Public API ───────────────────────────────────────────────

export async function listSkillLab(bookId: string): Promise<SkillLabResponse> {
  const store = await readStore(bookId)
  return toResponse(store, getConfig() !== null)
}

export async function analyzeSkillLab(bookId: string, input: SkillLabAnalyzeRequest): Promise<SkillLabResponse> {
  const normalizedInput = normalizeAnalyzeInput(input)
  const revisions = await collectSelectedRevisions(bookId, normalizedInput.ledgerEntryIds)
  const config = getConfig()
  if (!config) {
    const store = await readStore(bookId)
    return toResponse(store, false)
  }

  const existingSkills = await collectExistingSkills(bookId)
  const store = await readStore(bookId)

  const revisionsById = new Map(revisions.map((entry) => [entry.id, entry]))
  const existingNames = new Set(existingSkills.map((skill) => skill.name))

  let fresh: SkillSuggestion[] = []
  try {
    const result = await callChatCompletion(
      config,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPayload(revisions, existingSkills, normalizedInput.focus) },
      ],
      { temperature: 0.2, maxTokens: 2800, feature: "skill_lab" },
    )
    fresh = normalizeSuggestions(parseJsonFromModel(result.content), revisionsById, existingNames)
  } catch (error) {
    throw new Error(error instanceof Error ? `分析改稿失败：${error.message}` : "分析改稿失败。")
  }

  const merged = mergeSuggestions(store.suggestions, fresh)
  const updated = await writeStore(bookId, {
    suggestions: merged,
    skillMeta: store.skillMeta,
    analyzedAt: nowIso(),
    analyzedRevisionCount: revisions.length,
  })
  return toResponse(updated, true)
}

export async function dismissSkillSuggestion(bookId: string, suggestionId: string): Promise<SkillLabResponse> {
  const store = await readStore(bookId)
  const ts = nowIso()
  const suggestions = store.suggestions.map((s) =>
    s.id === suggestionId ? { ...s, status: "dismissed" as const, updatedAt: ts } : s,
  )
  const updated = await writeStore(bookId, { ...store, suggestions })
  return toResponse(updated, getConfig() !== null)
}

export async function saveSkillExperiment(
  bookId: string,
  input: SkillExperimentSaveRequest,
): Promise<{ skill: Skill; lab: SkillLabResponse }> {
  const instruction = clipText(typeof input.instruction === "string" ? input.instruction : "", 6000)
  if (instruction.length < 8) {
    throw new SkillLabInputError("请先写一条要保存成 Skill 的试验指令。")
  }

  const store = await readStore(bookId)
  const sourceSuggestion = input.sourceSuggestionId
    ? store.suggestions.find((suggestion) => suggestion.id === input.sourceSuggestionId)
    : undefined
  const sourceNameHint = sourceSuggestion?.kind === "new" ? sourceSuggestion.proposedName : undefined
  const nameHint = normalizeSkillName(input.nameHint || sourceNameHint || "experimental-skill") || "experimental-skill"
  const title = clipText(input.title ?? sourceSuggestion?.title ?? "实验 Skill", 80)
  const sampleText = clipText(input.sampleText ?? "", 1200)
  const originExperimentId = typeof input.originExperimentId === "string" && input.originExperimentId.trim()
    ? input.originExperimentId.trim()
    : undefined

  const provenance = [
    sourceSuggestion ? `来源线索：${sourceSuggestion.title}` : "",
    originExperimentId ? `来源试验：${originExperimentId}` : "",
  ].filter(Boolean).join("\n")
  const examples = [
    provenance,
    sampleText ? `试验样本摘录：\n${sampleText}` : "",
    sourceSuggestion?.evidence?.length
      ? `线索证据：\n${sourceSuggestion.evidence.map((item) => `- ${item.targetPath}: ${item.note}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n")

  const draft = await draftWorkspaceSkill({
    nameHint,
    goal: `${title}\n\n当前试验通过的指令：\n${instruction}`,
    triggers: [
      "当用户需要沿用这条已经在试验台打磨过的写作指令时使用。",
      title,
    ].join("\n"),
    examples,
    resourceKinds: [],
  })

  const skill = await createWorkspaceSkill(bookId, {
    name: draft.name,
    skillMd: draft.skillMd,
    resources: draft.resources,
  })
  await upsertSkillLabMeta(bookId, draft.name, {
    stage: "experimental",
    originObservationId: sourceSuggestion?.id,
    originExperimentId,
  })

  const ts = nowIso()
  const updatedStore = await writeStore(bookId, {
    ...store,
    skillMeta: {
      ...store.skillMeta,
      [draft.name]: {
        ...(store.skillMeta[draft.name] ?? { name: draft.name, trials: [] }),
        name: draft.name,
        stage: "experimental",
        originObservationId: sourceSuggestion?.id,
        originExperimentId,
      },
    },
    suggestions: sourceSuggestion
      ? store.suggestions.map((item) =>
          item.id === sourceSuggestion.id
            ? { ...item, status: "incubated" as const, incubatedSkillName: draft.name, updatedAt: ts }
            : item,
        )
      : store.suggestions,
  })

  return {
    skill: {
      ...skill,
      stage: "experimental",
      originObservationId: sourceSuggestion?.id,
      originExperimentId,
    },
    lab: toResponse(updatedStore, getConfig() !== null),
  }
}
