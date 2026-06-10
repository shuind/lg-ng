import type { AgentEvent } from "@/lib/types"

export function appendEventMarkdown(lines: string[], events: AgentEvent[]) {
  if (events.length === 0) return

  lines.push("### 行动摘要")
  for (const event of events) {
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
