import fs from "fs/promises"
import path from "path"
import type {
  LedgerEntry,
  Message,
  SkillCandidate,
  SkillCandidateEvidence,
  SkillCandidateEvalCase,
  SkillCandidateListResponse,
  SkillCandidateVariant,
  SkillDraftResponse,
} from "@/lib/types"
import { listLedgerEntries } from "@/lib/server/ledger"
import { listThreadMessages } from "@/lib/server/thread-store"
import { nowIso } from "@/lib/server/ids"
import { getBookDir } from "@/lib/server/paths"
import { draftClaudeSkill } from "@/lib/server/skill-draft-service"

const CANDIDATES_FILE = "skill-candidates.json"
const MAX_EVIDENCE_TEXT = 700
const MAX_MESSAGES = 40
const MAX_LEDGER_ENTRIES = 30

type CandidateStore = {
  candidates: SkillCandidate[]
  updatedAt: string
}

type CandidateSeed = {
  key: string
  title: string
  nameHint: string
  summary: string
  trigger: string
  rules: string[]
  evidence: SkillCandidateEvidence[]
  evalCases: SkillCandidateEvalCase[]
}

type PatternDefinition = {
  key: string
  title: string
  nameHint: string
  summary: string
  trigger: string
  keywords: string[]
  rules: string[]
  diffTerms?: string[]
}

const PATTERNS: PatternDefinition[] = [
  {
    key: "restrained-voice",
    title: "克制叙述与对白",
    nameHint: "restrained-voice",
    summary: "把外放情绪、解释性心理活动和夸张语气压低，更多依靠动作、停顿和细节表达。",
    trigger: "润色人物反应、对白、情绪段落，或用户要求更冷、更克制、更少解释时使用。",
    keywords: ["克制", "冷", "别太热", "不要煽情", "少解释", "动作", "短句", "冷峻", "内敛", "不要夸张"],
    rules: [
      "优先用动作、停顿、视线和物件细节承载情绪。",
      "减少感叹号、直白心理解释和强烈情绪词。",
      "句子可以更短，但不要牺牲场景连续性。",
    ],
    diffTerms: ["大笑", "狂喜", "喊道", "怒吼", "泪流满面", "崩溃", "激动"],
  },
  {
    key: "character-consistency",
    title: "人物一致性修正",
    nameHint: "character-consistency",
    summary: "写人物前先核对设定和最近状态，避免口癖、反应、立场和行动方式漂移。",
    trigger: "写角色互动、改人物对白、修正人物行为不对劲时使用。",
    keywords: ["人设", "性格", "不像", "口癖", "角色", "人物", "动机", "反应不对", "林晓", "设定"],
    rules: [
      "先确认角色当前目标、压力和关系位置。",
      "对白要符合角色的防御方式、知识范围和惯用动作。",
      "出现设定冲突时优先提示证据路径，再给改写方案。",
    ],
    diffTerms: ["不像", "人设", "口癖", "冷哼", "冷笑", "沉默", "摇头"],
  },
  {
    key: "chapter-hook",
    title: "章节钩子与收束",
    nameHint: "chapter-hook",
    summary: "章节结尾保留未完成的情绪、信息差或行动压力，而不是把冲突解释干净。",
    trigger: "续写章节结尾、调整节奏、增加悬念、处理章末钩子时使用。",
    keywords: ["钩子", "悬念", "章末", "结尾", "信息差", "留白", "伏笔", "悬疑", "下一章"],
    rules: [
      "结尾保留一个明确的未解决压力点。",
      "不要用解释性总结收尾，优先用动作或新信息截断。",
      "钩子应服务当前冲突，不额外硬塞新设定。",
    ],
    diffTerms: ["忽然", "门外", "脚步", "信", "没有说完", "停住"],
  },
  {
    key: "fight-clarity",
    title: "战斗动作清晰度",
    nameHint: "fight-clarity",
    summary: "战斗场景先交代力量差、空间位置和动作因果，避免一招结束或纯特效堆叠。",
    trigger: "写打斗、追逐、冲突升级、动作段落时使用。",
    keywords: ["战斗", "打斗", "动作", "追逐", "力量", "招式", "一招", "位置", "空间", "冲突"],
    rules: [
      "先明确双方目标、距离、可用空间和限制。",
      "每个动作都要有前因后果，避免只写招式名称。",
      "用受伤、失衡、环境破坏体现战斗进展。",
    ],
    diffTerms: ["一招", "飞出", "砸", "避开", "侧身", "剑", "拳"],
  },
]

function candidatePath(bookId: string): string {
  return path.join(getBookDir(bookId), CANDIDATES_FILE)
}

function clipText(value: string, maxLength = MAX_EVIDENCE_TEXT): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized
}

function normalizeScore(value: number): number {
  return Math.max(0, Math.min(0.98, Number(value.toFixed(2))))
}

async function readStore(bookId: string): Promise<CandidateStore> {
  try {
    const raw = await fs.readFile(candidatePath(bookId), "utf-8")
    const data = JSON.parse(raw) as Partial<CandidateStore>
    return {
      candidates: Array.isArray(data.candidates) ? data.candidates.filter(isCandidate) : [],
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : nowIso(),
    }
  } catch {
    return { candidates: [], updatedAt: nowIso() }
  }
}

async function writeStore(bookId: string, store: CandidateStore): Promise<CandidateStore> {
  const updated: CandidateStore = { ...store, updatedAt: nowIso() }
  const filePath = candidatePath(bookId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8")
  return updated
}

function isCandidate(value: unknown): value is SkillCandidate {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<SkillCandidate>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.rules) &&
    Array.isArray(candidate.evidence) &&
    Array.isArray(candidate.evalCases) &&
    Array.isArray(candidate.variants)
  )
}

function matchCount(text: string, terms: string[]): number {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0)
}

function messageEvidence(message: Message, pattern: PatternDefinition): SkillCandidateEvidence | null {
  const content = message.content.trim()
  if (!content) return null
  const hits = matchCount(content, pattern.keywords)
  if (hits === 0) return null
  return {
    id: `msg-${message.id}-${pattern.key}`,
    type: "message",
    label: message.role === "user" ? "用户要求" : "助手回应",
    text: clipText(content),
    ref: message.turnId,
  }
}

function diffEvidence(entry: LedgerEntry, pattern: PatternDefinition): SkillCandidateEvidence | null {
  const diff = entry.diffPatch || entry.summary || ""
  const terms = [...pattern.keywords, ...(pattern.diffTerms ?? [])]
  const hits = matchCount(diff, terms)
  if (hits === 0) return null
  return {
    id: `diff-${entry.id}-${pattern.key}`,
    type: "diff",
    label: entry.targetPath ? `改稿差异：${entry.targetPath}` : "改稿差异",
    text: clipText(diff),
    ref: entry.id,
  }
}

function createEvalCases(pattern: PatternDefinition, evidence: SkillCandidateEvidence[]): SkillCandidateEvalCase[] {
  return evidence.slice(0, 3).map((item, index) => ({
    id: `eval-${pattern.key}-${index + 1}`,
    input: item.text,
    expectedDirection: pattern.summary,
    notes: item.type === "diff" ? "来自真实改稿 diff，可用于比较使用 Skill 前后的改写方向。" : "来自真实对话，可用于验证触发条件是否准确。",
  }))
}

function createVariants(pattern: PatternDefinition): SkillCandidateVariant[] {
  return [
    {
      id: `${pattern.key}-balanced`,
      name: "平衡版",
      description: "保留当前规则强度，优先稳定复现用户偏好。",
      rules: pattern.rules,
    },
    {
      id: `${pattern.key}-light`,
      name: "轻量版",
      description: "只做最小干预，适合不确定是否要强风格化时测试。",
      rules: pattern.rules.slice(0, 2),
    },
    {
      id: `${pattern.key}-strong`,
      name: "强化版",
      description: "更明确地压实流程和输出边界，适合重复出现的问题。",
      rules: [...pattern.rules, "完成后检查输出是否真的体现了这个偏好，而不是只复述规则。"],
    },
  ]
}

function buildSeeds(messages: Message[], ledgerEntries: LedgerEntry[]): CandidateSeed[] {
  const seeds: CandidateSeed[] = []
  for (const pattern of PATTERNS) {
    const evidence = [
      ...messages.flatMap((message) => {
        const item = messageEvidence(message, pattern)
        return item ? [item] : []
      }),
      ...ledgerEntries.flatMap((entry) => {
        const item = diffEvidence(entry, pattern)
        return item ? [item] : []
      }),
    ]
    const uniqueEvidence = dedupeEvidence(evidence).slice(0, 8)
    if (uniqueEvidence.length < 2) continue
    seeds.push({
      key: pattern.key,
      title: pattern.title,
      nameHint: pattern.nameHint,
      summary: pattern.summary,
      trigger: pattern.trigger,
      rules: pattern.rules,
      evidence: uniqueEvidence,
      evalCases: createEvalCases(pattern, uniqueEvidence),
    })
  }
  return seeds
}

function dedupeEvidence(evidence: SkillCandidateEvidence[]): SkillCandidateEvidence[] {
  const seen = new Set<string>()
  const result: SkillCandidateEvidence[] = []
  for (const item of evidence) {
    const key = `${item.type}:${item.ref ?? item.text.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function mergeCandidate(existing: SkillCandidate | undefined, seed: CandidateSeed): SkillCandidate {
  const ts = nowIso()
  const evidence = dedupeEvidence([...(existing?.evidence ?? []), ...seed.evidence]).slice(0, 12)
  const occurrenceCount = Math.max(existing?.occurrenceCount ?? 0, evidence.length)
  return {
    id: existing?.id ?? `candidate-${seed.key}`,
    status: existing?.status === "dismissed" ? "dismissed" : existing?.status ?? "candidate",
    nameHint: existing?.nameHint ?? seed.nameHint,
    title: seed.title,
    summary: seed.summary,
    trigger: seed.trigger,
    rules: seed.rules,
    confidence: normalizeScore(Math.min(0.35 + evidence.length * 0.12, 0.92)),
    occurrenceCount,
    evidence,
    evalCases: seed.evalCases,
    variants: existing?.variants?.length ? existing.variants : createVariants({
      key: seed.key,
      title: seed.title,
      nameHint: seed.nameHint,
      summary: seed.summary,
      trigger: seed.trigger,
      keywords: [],
      rules: seed.rules,
    }),
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  }
}

export async function refreshSkillCandidates(bookId: string): Promise<SkillCandidateListResponse> {
  const [store, messages, ledgerPage] = await Promise.all([
    readStore(bookId),
    listThreadMessages(bookId).catch(() => []),
    listLedgerEntries(bookId, { limit: MAX_LEDGER_ENTRIES }).catch(() => ({ entries: [] })),
  ])
  const recentMessages = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MAX_MESSAGES)
  const seeds = buildSeeds(recentMessages, ledgerPage.entries)
  const byId = new Map(store.candidates.map((candidate) => [candidate.id, candidate]))

  for (const seed of seeds) {
    const id = `candidate-${seed.key}`
    byId.set(id, mergeCandidate(byId.get(id), seed))
  }

  const candidates = [...byId.values()]
    .sort((a, b) => {
      if (a.status !== b.status) return statusOrder(a.status) - statusOrder(b.status)
      return b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt)
    })
  const updated = await writeStore(bookId, { candidates, updatedAt: store.updatedAt })
  return updated
}

function statusOrder(status: SkillCandidate["status"]): number {
  if (status === "candidate") return 0
  if (status === "drafted") return 1
  return 2
}

export async function listSkillCandidates(bookId: string): Promise<SkillCandidateListResponse> {
  const store = await readStore(bookId)
  return {
    candidates: store.candidates.sort((a, b) => b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt)),
    updatedAt: store.updatedAt,
  }
}

export async function dismissSkillCandidate(bookId: string, candidateId: string): Promise<SkillCandidateListResponse> {
  const store = await readStore(bookId)
  const ts = nowIso()
  const candidates = store.candidates.map((candidate) =>
    candidate.id === candidateId ? { ...candidate, status: "dismissed" as const, updatedAt: ts } : candidate,
  )
  return writeStore(bookId, { candidates, updatedAt: store.updatedAt })
}

export async function draftSkillFromCandidate(bookId: string, candidateId: string): Promise<SkillDraftResponse> {
  const store = await readStore(bookId)
  const candidate = store.candidates.find((item) => item.id === candidateId)
  if (!candidate) throw new Error("Skill candidate not found")

  const examples = [
    "## 验证样本",
    ...candidate.evalCases.map((item, index) => [
      `### 样本 ${index + 1}`,
      `输入：${item.input}`,
      `期望方向：${item.expectedDirection}`,
      item.notes ? `备注：${item.notes}` : "",
    ].filter(Boolean).join("\n")),
    "",
    "## 证据",
    ...candidate.evidence.slice(0, 5).map((item) => `- ${item.label}: ${item.text}`),
  ].join("\n")

  const draft = await draftClaudeSkill({
    nameHint: candidate.nameHint,
    goal: `${candidate.summary}\n\n核心规则：\n${candidate.rules.map((rule) => `- ${rule}`).join("\n")}`,
    triggers: candidate.trigger,
    examples,
    resourceKinds: ["references"],
  })

  const ts = nowIso()
  await writeStore(bookId, {
    candidates: store.candidates.map((item) =>
      item.id === candidateId ? { ...item, status: "drafted", updatedAt: ts } : item,
    ),
    updatedAt: store.updatedAt,
  })

  return draft
}
