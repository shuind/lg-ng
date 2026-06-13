"use client"

import { AlertTriangle, CheckCircle2, Circle, Loader2, Wrench } from "lucide-react"
import type { AgentEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ActivityIndicator({
  events,
  streaming = false,
  className,
}: {
  events: AgentEvent[]
  streaming?: boolean
  className?: string
}) {
  const state = deriveActivityState(events, streaming)

  return (
    <div className={cn("surface-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]", className)}>
      <span className="mt-0.5 shrink-0 text-muted-foreground">
        {state.tone === "error" ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        ) : state.tone === "done" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : state.tone === "tool" ? (
          <Wrench className="h-3.5 w-3.5" />
        ) : streaming ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Circle className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-medium", state.tone === "error" ? "text-destructive" : "text-foreground/85")}>
          {state.title}
        </span>
        {state.detail && (
          <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
            {state.detail}
          </span>
        )}
      </span>
    </div>
  )
}

function deriveActivityState(events: AgentEvent[], streaming: boolean): {
  title: string
  detail?: string
  tone: "idle" | "tool" | "done" | "error"
} {
  const visibleEvents = events.filter((event) => !isTokenUsageText(event.text))
  const lastError = [...visibleEvents].reverse().find((event) => event.type === "error")
  if (lastError) {
    return {
      title: "处理遇到问题",
      detail: lastError.message ?? lastError.text,
      tone: "error",
    }
  }

  if (!streaming) {
    const done = [...visibleEvents].reverse().find((event) => event.type === "done")
    if (done) {
      return {
        title: done.text ?? "处理完成",
        detail: done.paths?.[0],
        tone: "done",
      }
    }
  }

  const latest = [...visibleEvents].reverse().find((event) =>
    event.type === "tool_call" ||
    event.type === "observe" ||
    event.type === "reasoning" ||
    event.type === "retrieve" ||
    event.type === "plan",
  )

  if (!latest) {
    return {
      title: streaming ? "正在启动模型" : "等待处理",
      tone: "idle",
    }
  }

  if (latest.type === "tool_call") {
    return {
      title: formatToolTitle(latest.name ?? latest.text ?? "tool"),
      detail: summarizeArgs(latest.argsPreview) ?? latest.paths?.[0],
      tone: "tool",
    }
  }

  if (latest.name && latest.resultPreview) {
    return {
      title: `${latest.name} 完成`,
      detail: summarizePreview(latest.resultPreview),
      tone: "tool",
    }
  }

  if (latest.type === "reasoning") {
    return {
      title: "正在整理思路",
      detail: summarizePreview(latest.text),
      tone: "idle",
    }
  }

  return {
    title: latest.text ?? "正在处理",
    detail: latest.paths?.[0],
    tone: "idle",
  }
}

function formatToolTitle(name: string): string {
  const normalized = name.trim()
  if (normalized === "read_file") return "正在读取文件"
  if (normalized === "grep" || normalized === "glob" || normalized === "search_canon") return "正在检索资料"
  if (normalized === "write_file" || normalized === "edit_file") return "正在写入项目文件"
  if (normalized === "propose_file_change") return "正在生成改动提案"
  return `正在调用 ${normalized}`
}

function isTokenUsageText(value?: string): boolean {
  return Boolean(value?.startsWith("Token usage:") || value?.startsWith("token 用量："))
}

function summarizeArgs(value?: string): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  const pathMatch = trimmed.match(/"path"\s*:\s*"([^"]+)"/)
  if (pathMatch?.[1]) return pathMatch[1]
  const queryMatch = trimmed.match(/"query"\s*:\s*"([^"]+)"/)
  if (queryMatch?.[1]) return queryMatch[1]
  return summarizePreview(trimmed)
}

function summarizePreview(value?: string): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return undefined
  return text.slice(0, 120)
}
