import fs from "fs/promises"
import path from "path"
import { readBookFile } from "@/lib/server/book-store"
import { getConfig, callChatCompletion } from "@/lib/server/llm"
import { getBookDir } from "@/lib/server/paths"

// ─── Types ─────────────────────────────────────────────────────

export type SystemCheckType =
  | "foreshadowing"
  | "timeline"
  | "character_position"
  | "reader_experience"
  | "quality"

export interface SystemCheckInput {
  bookId: string
  checkType: SystemCheckType
  target?: string
  goal: string
}

export interface SystemCheckResult {
  title: string
  content: string
}

// ─── File Helpers ──────────────────────────────────────────────

async function listDirFiles(bookId: string, dirPath: string): Promise<string[]> {
  const absDir = path.join(getBookDir(bookId), dirPath)
  try {
    const entries = await fs.readdir(absDir, { withFileTypes: true })
    return entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => `${dirPath}/${e.name}`)
  } catch {
    return []
  }
}

async function readFilesContent(bookId: string, paths: string[], maxLen = 2000): Promise<string> {
  const blocks: string[] = []
  for (const p of paths) {
    const content = await readBookFile(bookId, p)
    if (content) {
      const trimmed = content.length > maxLen ? content.slice(0, maxLen) + "\n...（截断）" : content
      blocks.push(`### ${p}\n\n${trimmed}`)
    }
  }
  return blocks.join("\n\n---\n\n") || "（未找到相关文件）"
}

// ─── Rule-Based Fallback ──────────────────────────────────────

function buildFallbackReport(input: SystemCheckInput, fileContents: string, _filesRead: string[]): string {
  const lines: string[] = []
  const issues: string[] = []

  // scan for known markers
  const markers = [
    { re: /待回收/g, label: "伏笔待回收" },
    { re: /⬜待回收/g, label: "伏笔待回收" },
    { re: /待兑现/g, label: "情绪/爽点待兑现" },
    { re: /⏳待兑现/g, label: "情绪/爽点待兑现" },
    { re: /未指定/g, label: "字段未指定" },
    { re: /待补充/g, label: "内容待补充" },
    { re: /读者未知/g, label: "读者信息差" },
    { re: /读者已知/g, label: "读者已知信息" },
  ]

  for (const m of markers) {
    const matches = fileContents.match(m.re)
    if (matches && matches.length > 0) {
      issues.push(`发现 ${matches.length} 处"${m.label}"标记`)
    }
  }

  // check for banned patterns in quality mode
  if (input.checkType === "quality") {
    const bannedSection = fileContents.match(/禁止项[\s\S]*?(?=##|$)/)
    if (bannedSection) {
      const patterns = bannedSection[0].match(/-\s*\*\*(.+?)\*\*/g)
      if (patterns && patterns.length > 0) {
        lines.push(`### 已记录的禁止项（共 ${patterns.length} 条）`)
        for (const p of patterns.slice(0, 10)) {
          lines.push(p)
        }
        lines.push("")
        lines.push("> 注意：规则 fallback 无法自动扫描章节正文中的禁止项命中情况，请开启 LLM 以获得深度检查。")
      }
    }
  }

  // foreshadowing: list un-recovered entries
  if (input.checkType === "foreshadowing") {
    const pending = fileContents.match(/-\s*\*\*.*?\*\*.*?⬜待回收/g)
    if (pending && pending.length > 0) {
      issues.push(`发现 ${pending.length} 条未回收伏笔：`)
      for (const p of pending.slice(0, 10)) {
        issues.push(`  ${p}`)
      }
    } else {
      issues.push("未发现标记为待回收的伏笔条目")
    }
    const recovered = fileContents.match(/✅已回收/g)
    if (recovered) {
      issues.push(`已回收伏笔 ${recovered.length} 条`)
    }
  }

  // timeline: check for entries without time
  if (input.checkType === "timeline") {
    const timeEntries = fileContents.match(/-\s*\*\*.*?\*\*/g)
    if (timeEntries) {
      issues.push(`时间线共 ${timeEntries.length} 条记录`)
    } else {
      issues.push("时间线暂无记录")
    }
  }

  // character_position: list character entries
  if (input.checkType === "character_position") {
    const posEntries = fileContents.match(/-\s*\*\*.*?\*\*：.+/g)
    if (posEntries) {
      issues.push(`角色位置共 ${posEntries.length} 条记录`)
      if (input.target) {
        const targetEntries = posEntries.filter((e) => e.includes(input.target!))
        if (targetEntries.length > 0) {
          issues.push(`"${input.target}"相关记录 ${targetEntries.length} 条：`)
          for (const e of targetEntries.slice(0, 5)) {
            issues.push(`  ${e}`)
          }
        } else {
          issues.push(`未找到"${input.target}"的位置记录`)
        }
      }
    } else {
      issues.push("角色位置暂无记录")
    }
  }

  // reader_experience: list pending debts
  if (input.checkType === "reader_experience") {
    const pendingDebt = fileContents.match(/-\s*\*\*.*?\*\*.*?⏳待兑现/g)
    if (pendingDebt && pendingDebt.length > 0) {
      issues.push(`发现 ${pendingDebt.length} 条待兑现的期待/债务`)
    } else {
      issues.push("未发现待兑现的期待/债务")
    }
  }

  if (issues.length === 0) {
    issues.push("规则 fallback 未发现明显问题。如需深度检查，请开启 LLM。")
  }

  lines.push("## 发现的问题\n")
  for (let i = 0; i < issues.length; i++) {
    lines.push(`${i + 1}. ${issues[i]}`)
  }

  return lines.join("\n")
}

// ─── LLM Report Generation ────────────────────────────────────

const CHECK_PROMPTS: Record<SystemCheckType, string> = {
  foreshadowing: `你是一个小说系统一致性检查助手。请检查以下伏笔清单和关键事件，生成检查报告。

检查目标：
- 已埋但未回收的伏笔（标记为⬜待回收）
- 标记为已回收但没有回收说明的伏笔
- 伏笔回收章节是否缺失
- 关键事件中是否出现疑似回收但伏笔清单没更新

报告格式：
# 伏笔检查报告

## 结论
- 总体判断：通过 / 有风险 / 需要人工确认
- 主要问题数量：N

## 发现的问题
### 1. {问题标题}
- 类型：
- 涉及位置：
- 证据：
- 风险：
- 建议：

## 建议的后续处理`,

  timeline: `你是一个小说系统一致性检查助手。请检查以下时间线和关键事件，生成检查报告。

检查目标：
- 同一事件出现多个时间
- 时间顺序和章节顺序不一致
- 没有故事时间的关键事件
- "当前章节/当前时间"缺失

报告格式：
# 时间线检查报告

## 结论
- 总体判断：通过 / 有风险 / 需要人工确认
- 主要问题数量：N

## 发现的问题
### 1. {问题标题}
- 类型：
- 涉及位置：
- 证据：
- 风险：
- 建议：

## 建议的后续处理`,

  character_position: `你是一个小说系统一致性检查助手。请检查以下角色位置、章节摘要和人物设定，生成检查报告。

检查目标：
- 同一角色在相近章节出现在多个地点（逻辑矛盾）
- 角色位置更新缺失
- 章节摘要中出现角色但角色位置未记录
- 重点检查指定角色的位置一致性

报告格式：
# 角色位置检查报告

## 结论
- 总体判断：通过 / 有风险 / 需要人工确认
- 主要问题数量：N

## 发现的问题
### 1. {问题标题}
- 类型：
- 涉及位置：
- 证据：
- 风险：
- 建议：

## 建议的后续处理`,

  reader_experience: `你是一个小说系统一致性检查助手。请检查以下读者体验相关文件和章节摘要，生成检查报告。

检查目标：
- 读者知道的信息与角色知道的信息混乱
- 情绪债务/爽点债务长期未兑现
- 章节摘要中已有兑现但债务文件未更新
- 反转/悬念是否缺少铺垫

报告格式：
# 读者体验检查报告

## 结论
- 总体判断：通过 / 有风险 / 需要人工确认
- 主要问题数量：N

## 发现的问题
### 1. {问题标题}
- 类型：
- 涉及位置：
- 证据：
- 风险：
- 建议：

## 建议的后续处理`,

  quality: `你是一个小说系统一致性检查助手。请检查以下写作约束和章节正文，生成检查报告。

检查目标：
- 是否出现禁止项中的表达
- 是否违反质量规则
- 是否重复使用禁用比喻/套路
- 是否存在明显风格偏离

报告格式：
# 写作质量检查报告

## 结论
- 总体判断：通过 / 有风险 / 需要人工确认
- 主要问题数量：N

## 发现的问题
### 1. {问题标题}
- 类型：
- 涉及位置：
- 证据：
- 风险：
- 建议：

## 建议的后续处理`,
}

async function collectFilesForCheck(input: SystemCheckInput): Promise<string[]> {
  const { bookId, checkType, target } = input
  const files: string[] = []

  switch (checkType) {
    case "foreshadowing":
      files.push("剧情管理/伏笔清单.md", "剧情管理/关键事件.md")
      files.push(...(await listDirFiles(bookId, "章节摘要")))
      break
    case "timeline":
      files.push("状态追踪/时间线.md", "剧情管理/关键事件.md")
      files.push(...(await listDirFiles(bookId, "章节摘要")))
      break
    case "character_position":
      files.push("状态追踪/角色位置.md")
      files.push(...(await listDirFiles(bookId, "章节摘要")))
      // also read target character file if specified
      if (target) {
        files.push(`人物设定/${target}.md`)
      }
      break
    case "reader_experience":
      files.push("读者体验/信息差.md", "读者体验/情绪账户.md", "读者体验/爽点债务.md")
      files.push(...(await listDirFiles(bookId, "章节摘要")))
      break
    case "quality":
      files.push("写作约束/禁止项.md", "写作约束/质量约束.md", "创作指南.md")
      // read up to 3 most recent chapter files
      const chapterFiles = await listDirFiles(bookId, "章节正文")
      files.push(...chapterFiles.slice(0, 3))
      break
  }

  return [...new Set(files)]
}

// ─── Main Entry ────────────────────────────────────────────────

export async function generateSystemCheckReport(input: SystemCheckInput): Promise<SystemCheckResult> {
  const checkTypeLabels: Record<SystemCheckType, string> = {
    foreshadowing: "伏笔检查",
    timeline: "时间线检查",
    character_position: "角色位置检查",
    reader_experience: "读者体验检查",
    quality: "写作质量检查",
  }

  const title = checkTypeLabels[input.checkType]
  const filesToRead = await collectFilesForCheck(input)
  const fileContents = await readFilesContent(input.bookId, filesToRead)

  const config = getConfig()
  let reportBody = ""

  if (config) {
    try {
      const systemPrompt = CHECK_PROMPTS[input.checkType].replace("{target}", input.target ?? "")
      const userContent = `## 检查目标

${input.goal}

${input.target ? `## 重点检查对象\n\n${input.target}` : ""}

## 相关文件内容

${fileContents}`

      reportBody = (await callChatCompletion(
        config,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        { temperature: 0.3, maxTokens: 2000 },
      )).content
    } catch {
      reportBody = ""
    }
  }

  // fallback if LLM unavailable or failed
  if (!reportBody) {
    reportBody = buildFallbackReport(input, fileContents, filesToRead)
  }

  const timestamp = new Date().toLocaleString("zh-CN")
  const content = `# ${title}

检查目标：${input.goal}
${input.target ? `重点对象：${input.target}` : ""}
检查时间：${timestamp}

---

${reportBody}
`

  return { title, content }
}
