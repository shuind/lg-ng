import type { AgentEvent, Message } from "@/lib/mock-data"

export type ExportMode = "simple" | "full"

export function getExportMessages(messages: Message[], selectedTurnId: string | null): Message[] {
  if (!selectedTurnId) return messages
  const selectedIndex = messages.findLastIndex((message) => message.turnId === selectedTurnId)
  if (selectedIndex < 0) return messages
  return messages.slice(0, selectedIndex + 1)
}

export function buildChatExportMarkdown({
  bookTitle,
  threadTitle,
  messages,
  exportedAt,
  mode,
}: {
  bookTitle: string
  threadTitle: string
  messages: Message[]
  exportedAt: Date
  mode: ExportMode
}): string {
  const lines: string[] = [
    `# ${bookTitle || "未命名书籍"} - ${threadTitle || "任务线程"}`,
    "",
    `- 导出时间: ${formatDisplayDate(exportedAt.toISOString())}`,
    `- 导出范围: ${messages.length} 条消息`,
    `- 导出模式: ${mode === "full" ? "完整信息" : "对话"}`,
    "",
  ]

  for (const message of messages) {
    lines.push(`## ${roleLabel(message.role)} - ${formatDisplayDate(message.createdAt)}`)
    lines.push("")
    lines.push(message.content.trim() || "（空消息）")
    lines.push("")

    if (message.references && message.references.length > 0) {
      lines.push("### 引用路径")
      for (const reference of message.references) {
        const label = [reference.name, reference.path].filter(Boolean).join(" - ")
        lines.push(`- ${label || reference.type}`)
      }
      lines.push("")
    }

    if (mode === "full") {
      appendFullMessageDetails(lines, message)
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`
}

function appendFullMessageDetails(lines: string[], message: Message) {
  if (message.constraints && message.constraints.length > 0) {
    lines.push("### 回复约束")
    for (const constraint of message.constraints) {
      const prefix = constraint.source === "temporary" ? "本轮" : constraint.title
      lines.push(`- ${prefix}: ${constraint.instruction}`)
    }
    lines.push("")
  }

  if (message.thought) {
    lines.push("### Thought")
    lines.push(`- 用时: ${message.thoughtSeconds ?? 0}s`)
    lines.push(`- 内容: ${message.thought}`)
    lines.push("")
  }

  if (message.brief) {
    appendBriefMarkdown(lines, message.brief)
  }

  if (message.events && message.events.length > 0) {
    lines.push("### 行动摘要")
    for (const event of message.events) {
      lines.push(`- ${eventLabel(event.type)}: ${event.text ?? event.message ?? event.name ?? ""}`.trim())
      if (event.paths && event.paths.length > 0) {
        for (const path of event.paths) {
          lines.push(`  - ${path}`)
        }
      }
      if (event.steps && event.steps.length > 0) {
        for (const step of event.steps) {
          lines.push(`  - ${step}`)
        }
      }
    }
    lines.push("")
  }
}

function eventLabel(type: AgentEvent["type"] | string): string {
  switch (type) {
    case "observe":
      return "理解任务"
    case "retrieve":
      return "读取上下文"
    case "plan":
      return "整理思路"
    case "tool_call":
      return "调用工具"
    case "done":
      return "处理完成"
    case "error":
      return "处理失败"
    default:
      return "历史事件"
  }
}

function appendBriefMarkdown(lines: string[], brief: NonNullable<Message["brief"]>) {
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

  if (brief.taskModel) {
    lines.push("- 任务模型:")
    lines.push(`  - 用户目标: ${brief.taskModel.userGoal}`)
    lines.push(`  - 类型: ${brief.taskModel.taskType}`)
    lines.push(`  - 层级: ${brief.taskModel.artifactLevel}`)
    lines.push(`  - 领域: ${brief.taskModel.targetDomain ?? "unknown"}`)
    lines.push(`  - 置信度: ${brief.taskModel.confidence.toFixed(2)}`)
    lines.push(`  - 写入: ${brief.taskModel.needsBookMutation ? "yes" : "no"}`)
    lines.push(`  - 诊断: ${brief.taskModel.needsCreativeDiagnosis ? "yes" : "no"}`)
    lines.push(`  - Prompt brief: ${brief.taskModel.needsPromptBrief ? "yes" : "no"}`)
    if (brief.taskModel.domainReasoning) {
      lines.push(`  - 理由: ${brief.taskModel.domainReasoning}`)
    }
    appendNestedList(lines, "缺失产物", brief.taskModel.missingArtifacts)
  }

  if (brief.selfImprovement) {
    lines.push("- 系统复盘:")
    lines.push(`  - 触发: ${brief.selfImprovement.triggered ? "yes" : "no"}`)
    if (brief.selfImprovement.triggerReason) {
      lines.push(`  - 原因: ${brief.selfImprovement.triggerReason}`)
    }
    appendNestedList(lines, "失败链路", brief.selfImprovement.failureChain)
    appendNestedList(lines, "失败层级", brief.selfImprovement.failureLayers)
    if (brief.selfImprovement.codexBrief) {
      lines.push("  - Codex brief:")
      lines.push(indentBlock(brief.selfImprovement.codexBrief, "    "))
    }
    appendNestedList(lines, "评估用例", brief.selfImprovement.proposedEvalCases)
    appendNestedList(lines, "运行规则", brief.selfImprovement.proposedRules)
  }

  lines.push("")
}

function appendListSection(lines: string[], label: string, items?: string[]) {
  if (!items || items.length === 0) return
  lines.push(`- ${label}:`)
  for (const item of items) {
    lines.push(`  - ${item}`)
  }
}

function appendNestedList(lines: string[], label: string, items?: string[]) {
  if (!items || items.length === 0) return
  lines.push(`  - ${label}:`)
  for (const item of items) {
    lines.push(`    - ${item}`)
  }
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join("\n")
}

function roleLabel(role: Message["role"]): string {
  if (role === "user") return "用户"
  if (role === "assistant") return "助手"
  return "系统"
}

export function formatDisplayDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function formatFilenameDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("")
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
  return cleaned || "chat-export.md"
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
