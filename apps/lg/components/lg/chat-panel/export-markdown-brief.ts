import type { Message } from "@/lib/types"
import { appendListSection, appendNestedList } from "./export-markdown-list-utils"

export function appendBriefMarkdown(lines: string[], brief: NonNullable<Message["brief"]>) {
  lines.push("### Brief")
  appendListSection(lines, "我理解的任务", brief.understood)
  appendListSection(lines, "使用的上下文", brief.contextPaths)
  appendListSection(lines, "修改的文件", brief.changedPaths)
  appendListSection(lines, "诊断", brief.diagnosis)
  appendListSection(lines, "建议", brief.recommendations)
  if (brief.investigation) {
    lines.push("- 主动调查:")
    lines.push(`  - 目标: ${brief.investigation.goal}`)
    appendNestedList(lines, "源文件", brief.investigation.sources)
    appendNestedList(lines, "确认事实", brief.investigation.findings)
    appendNestedList(lines, "未确认", brief.investigation.unresolved)
  }
  if (brief.factCheck) {
    lines.push("- 事实核对:")
    appendNestedList(lines, "已核对", brief.factCheck.checked)
    appendNestedList(lines, "已纠正", brief.factCheck.corrected)
    appendNestedList(lines, "未确认", brief.factCheck.unresolved)
  }
  appendListSection(lines, "上下文片段", brief.usedFragments)
  appendListSection(lines, "工具轨迹", brief.toolTrace)
  appendListSection(lines, "缺失信息", brief.missing)

  lines.push("")
}
