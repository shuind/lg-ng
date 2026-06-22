import type {
  CreateSkillRequest,
  Skill,
  SkillExperimentRunRequest,
  SkillExperimentResult,
  SkillExperimentSaveRequest,
  SkillLabAnalyzeRequest,
  SkillDraftRequest,
  SkillDraftResponse,
  SkillLabResponse,
  SkillTrial,
  SkillTrialSampleSource,
  SkillTrialVerdict,
  UpdateSkillRequest,
} from "../types"
import { delay } from "./common"

function fallbackWorkspaceSkill(bookId: string): Skill {
  return {
    id: "workspace-skill-plot-design",
    type: "workspace_skill",
    kind: "method",
    name: "plot-design",
    description: "剧情主线、关卡、冲突、悬念和切入点的设计方法。",
    scope: "book",
    bookId,
    sourceFile: ".novel-guide/skills/plot-design/SKILL.md",
    summaryTokenCount: 0,
    lastSourceModified: "",
    lastSummaryGenerated: "",
    dirty: false,
    source: "workspace_skill",
  }
}

export async function listSkills(bookId: string): Promise<Skill[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills`, { cache: "no-store" })
    if (!res.ok) throw new Error("接口请求失败")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("接口返回格式无效")
    return data
  } catch {
    await delay()
    return [fallbackWorkspaceSkill(bookId)]
  }
}

export async function draftSkill(bookId: string, input: SkillDraftRequest): Promise<SkillDraftResponse> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "接口请求失败")
    return {
      name: typeof data.name === "string" ? data.name : "novel-skill",
      skillMd: typeof data.skillMd === "string" ? data.skillMd : "",
      resources: Array.isArray(data.resources) ? data.resources : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    }
  } catch {
    await delay()
    return {
      name: "novel-skill",
      skillMd: [
        "---",
        "name: novel-skill",
        "kind: method",
        "description: \"当前书籍项目内可复用的小说写作流程。\"",
        "when_to_use: \"当用户明确需要这套写作流程时使用。\"",
        "argument-hint: \"[范围或参考材料]\"",
        "---",
        "",
        "# novel-skill",
        "",
        "这个 Skill 用来沉淀一套可复用的小说写作流程。",
        "",
        "## 工作流程",
        "",
        "1. 先确认用户这次想要的具体产出。",
        "2. 判断是否需要读取相关书籍文件，不要凭空断言。",
        "3. 结合项目设定、写作约束和必要参考资料处理。",
        "4. 输出结果时保持简洁，需要时给出相关文件路径。",
        "",
      ].join("\n"),
      resources: [],
      warnings: ["暂时无法连接草稿接口，已先生成本地模板。"],
    }
  }
}

export async function createSkill(bookId: string, input: CreateSkillRequest): Promise<Skill> {
  const res = await fetch(`/api/books/${bookId}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "创建 Skill 失败。")
  }
  if (data?.skill) return data.skill
  throw new Error("创建 Skill 成功但接口没有返回 Skill 信息。")
}

export async function getSkillDraft(bookId: string, skillName: string): Promise<SkillDraftResponse> {
  const res = await fetch(`/api/books/${bookId}/skills/${encodeURIComponent(skillName)}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "读取 Skill 失败。")
  }
  return {
    name: typeof data.name === "string" ? data.name : skillName,
    skillMd: typeof data.skillMd === "string" ? data.skillMd : "",
    resources: Array.isArray(data.resources) ? data.resources : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  }
}

function normalizeLabResponse(data: unknown): SkillLabResponse {
  const raw = data && typeof data === "object" ? (data as Partial<SkillLabResponse>) : {}
  return {
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [],
    analyzedAt: typeof raw.analyzedAt === "string" ? raw.analyzedAt : "",
    analyzedRevisionCount: typeof raw.analyzedRevisionCount === "number" ? raw.analyzedRevisionCount : 0,
    modelConfigured: raw.modelConfigured === true,
  }
}

export async function listSkillLab(bookId: string): Promise<SkillLabResponse> {
  const res = await fetch(`/api/books/${bookId}/skills/lab`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "读取 Skill Lab 失败。")
  }
  return normalizeLabResponse(data)
}

export async function analyzeSkillLab(bookId: string, input: SkillLabAnalyzeRequest): Promise<SkillLabResponse> {
  const res = await fetch(`/api/books/${bookId}/skills/lab`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "分析改稿失败。")
  }
  return normalizeLabResponse(data)
}

export async function dismissSkillSuggestion(bookId: string, suggestionId: string): Promise<SkillLabResponse> {
  const res = await fetch(`/api/books/${bookId}/skills/lab/${encodeURIComponent(suggestionId)}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "忽略 Skill 建议失败。")
  }
  return normalizeLabResponse(data)
}

export async function promoteSkill(bookId: string, skillName: string): Promise<Skill> {
  const res = await fetch(`/api/books/${bookId}/skills/lab/skills/${encodeURIComponent(skillName)}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Skill 毕业失败。")
  }
  if (data?.skill) return data.skill
  throw new Error("Skill 毕业成功但接口没有返回 Skill 信息。")
}

export async function runSkillTrial(
  bookId: string,
  input: { skillName: string; sampleText: string; sampleSource?: SkillTrialSampleSource },
): Promise<SkillTrial> {
  const res = await fetch(`/api/books/${bookId}/skills/lab/trial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "A/B 探针运行失败。")
  }
  if (data?.trial) return data.trial
  throw new Error("A/B 探针完成但接口没有返回记录。")
}

export async function recordSkillTrialVerdict(
  bookId: string,
  trialId: string,
  verdict: SkillTrialVerdict,
  judgeNote?: string,
): Promise<SkillTrial> {
  const res = await fetch(`/api/books/${bookId}/skills/lab/trial/${encodeURIComponent(trialId)}/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verdict, judgeNote }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "记录 A/B 判定失败。")
  }
  if (data?.trial) return data.trial
  throw new Error("记录 A/B 判定成功但接口没有返回记录。")
}

export async function runSkillExperiment(
  bookId: string,
  input: SkillExperimentRunRequest,
): Promise<SkillExperimentResult> {
  const res = await fetch(`/api/books/${bookId}/skills/lab/experiment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "试验台 A/B 运行失败。")
  }
  if (data?.result) return data.result
  throw new Error("试验台 A/B 完成但接口没有返回结果。")
}

export async function saveSkillExperiment(
  bookId: string,
  input: SkillExperimentSaveRequest,
): Promise<{ skill: Skill; lab: SkillLabResponse }> {
  const res = await fetch(`/api/books/${bookId}/skills/lab/experiment/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "保存实验 Skill 失败。")
  }
  if (data?.skill && data?.lab) return { skill: data.skill, lab: normalizeLabResponse(data.lab) }
  throw new Error("保存实验 Skill 成功但接口没有返回完整结果。")
}

export async function updateSkill(bookId: string, input: UpdateSkillRequest): Promise<Skill> {
  const res = await fetch(`/api/books/${bookId}/skills/${encodeURIComponent(input.originalName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "更新 Skill 失败。")
  }
  if (data?.skill) return data.skill
  throw new Error("更新 Skill 成功但接口没有返回 Skill 信息。")
}

export async function deleteSkill(bookId: string, skillName: string): Promise<void> {
  const res = await fetch(`/api/books/${bookId}/skills/${encodeURIComponent(skillName)}`, {
    method: "DELETE",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "删除 Skill 失败。")
  }
}

