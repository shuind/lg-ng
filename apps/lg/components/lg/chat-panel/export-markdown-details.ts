import type { Message } from "@/lib/types"
import { appendBriefMarkdown } from "./export-markdown-brief"
import { appendEventMarkdown } from "./export-markdown-events"

export function appendFullMessageDetails(lines: string[], message: Message) {
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
    appendEventMarkdown(lines, message.events)
  }
}
