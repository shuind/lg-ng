import type { Message } from "@/lib/mock-data"
import { appendFullMessageDetails } from "./export-markdown-details"
import { formatDisplayDate, roleLabel } from "./export-markdown-utils"

export type ExportMode = "simple" | "full"

export { downloadMarkdown, formatDisplayDate, formatFilenameDate, sanitizeFilename } from "./export-markdown-utils"

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
