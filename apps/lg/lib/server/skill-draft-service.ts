import type { SkillDraftRequest, SkillDraftResponse, SkillResourceKind, SkillTextResource } from "@/lib/types"
import { callChatCompletion, getConfig } from "@/lib/server/llm"
import { parseJsonFromModel } from "@/lib/server/llm-json"
import {
  normalizeResourceKinds,
  normalizeResourcePath,
  normalizeSkillKind,
  normalizeSkillName,
  safeYamlValue,
  validateSkillDraft,
} from "@/lib/server/skill-validation"

function fallbackSkillName(nameHint: string): { name: string; warnings: string[] } {
  const normalized = normalizeSkillName(nameHint)
  if (normalized) return { name: normalized, warnings: [] }
  return {
    name: "novel-skill",
    warnings: ["名称无法自动转换成安全的英文短名，请手动确认 Skill 短名。"],
  }
}

function createTemplateSkillMd(name: string, input: SkillDraftRequest): string {
  const kind = normalizeSkillKind(input.kind)
  const goal = input.goal.trim() || "说明这个 Skill 要沉淀哪一种可复用的小说写作能力。"
  const triggers = (input.triggers ?? "").trim() || "当用户明确需要这套流程时使用。"
  const examples = (input.examples ?? "").trim()
  const examplesBlock = examples
    ? `\n## 示例\n\n${examples}\n`
    : ""

return `---
name: ${name}
kind: ${kind}
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

function ensureSkillMdKind(skillMd: string, kind: string): string {
  const lines = skillMd.split(/\r?\n/)
  if (lines[0] !== "---") return skillMd

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      lines.splice(index, 0, `kind: ${kind}`)
      return lines.join("\n")
    }
    if (!lines[index].match(/^kind:\s*/)) continue

    lines[index] = `kind: ${kind}`
    return lines.join("\n")
  }

  return skillMd
}

function normalizeDraftResponse(raw: unknown, fallbackName: string, kind: string, fallback: SkillDraftResponse): SkillDraftResponse {
  const data = raw && typeof raw === "object" ? raw as Partial<SkillDraftResponse> : {}
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((item): item is string => typeof item === "string")
    : []
  const name = normalizeSkillName(typeof data.name === "string" ? data.name : fallbackName) || fallbackName
  const skillMd = ensureSkillMdKind(
    typeof data.skillMd === "string" && data.skillMd.trim()
      ? data.skillMd.trimEnd() + "\n"
      : fallback.skillMd,
    kind,
  )
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

export async function draftWorkspaceSkill(input: SkillDraftRequest): Promise<SkillDraftResponse> {
  const resourceKinds = normalizeResourceKinds(input.resourceKinds)
  const kind = normalizeSkillKind(input.kind)
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
      warnings: [...fallback.warnings, "当前没有可用的模型通道，已先生成可编辑的模板草稿。"],
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
          "SKILL.md must start with YAML frontmatter containing name, kind, and description.",
          "The frontmatter kind must be exactly the provided kind: writing, judgment, or method.",
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
          kind,
          goal: input.goal,
          triggers: input.triggers,
          examples: input.examples,
          resourceKinds,
        }, null, 2),
      },
    ], { temperature: 0.2, maxTokens: 2400, feature: "skill_draft" })

    return normalizeDraftResponse(parseJsonFromModel(result.content), name, kind, fallback)
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
