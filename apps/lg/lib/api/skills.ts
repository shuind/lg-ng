import type { CreateSkillRequest, Skill, SkillDraftRequest, SkillDraftResponse, UpdateSkillRequest } from "../types"
import { delay } from "./common"

function fallbackStyleGuideSkill(bookId: string): Skill {
  return {
    id: `skill-style-${bookId}`,
    type: "style_guide",
    scope: "book",
    bookId,
    sourceFile: "创作指南.md",
    summaryFile: "skills/style_guide_summary.md",
    summaryTokenCount: 0,
    lastSourceModified: "",
    lastSummaryGenerated: "",
    dirty: false,
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
    return [fallbackStyleGuideSkill(bookId)]
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

export async function getStyleGuideSkill(bookId: string): Promise<{ skill: Skill; summary: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/style-guide`, { cache: "no-store" })
    if (!res.ok) throw new Error("接口请求失败")
    return await res.json()
  } catch {
    await delay()
    return {
      skill: fallbackStyleGuideSkill(bookId),
      summary: "",
    }
  }
}

export async function refreshStyleGuideSummary(bookId: string): Promise<{ skill: Skill; summary: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/style-guide/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) throw new Error("接口请求失败")
    return await res.json()
  } catch {
    await delay()
    return {
      skill: fallbackStyleGuideSkill(bookId),
      summary: "",
    }
  }
}
