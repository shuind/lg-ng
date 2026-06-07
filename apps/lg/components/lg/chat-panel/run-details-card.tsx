"use client"

import { ChevronDown, ListChecks } from "lucide-react"
import type { AgentEvent, Message } from "@/lib/mock-data"

export function RunDetailsCard({
  brief,
  events,
}: {
  brief?: Message["brief"]
  events: AgentEvent[]
}) {
  const toolTrace = brief?.toolTrace ?? events
    .filter((event) => event.type === "tool_call")
    .map((event) => event.text ?? event.name ?? "")
    .filter(Boolean)
  const failures = [
    ...(brief?.diagnosis ?? []).filter((item) => !item.startsWith("Token usage:")),
    ...events.filter((event) => event.type === "error").map((event) => event.message ?? event.text ?? "处理失败"),
  ]
  const visibleNotes = [
    ...(brief?.recommendations ?? []).filter((item) => !item.startsWith("Token usage:")),
    ...(brief?.missing ?? []).map((item) => `缺少：${item}`),
  ].slice(0, 4)
  const contextPaths = brief?.contextPaths ?? events.flatMap((event) => event.paths ?? [])
  const changedPaths = brief?.changedPaths ?? events.flatMap((event) => event.paths ?? [])
  const toolSummary = summarizeToolTrace(toolTrace)
  const hasDetails = toolTrace.length > 0 || failures.length > 0 || visibleNotes.length > 0 || contextPaths.length > 0 || changedPaths.length > 0

  if (!hasDetails) return null

  return (
    <details className="group mt-1 rounded-lg border border-border/50 bg-muted/20 text-[12px] text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <ListChecks className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-foreground/80">处理细节</span>
        <span className="min-w-0 flex-1 truncate">{failures.length > 0 ? `${failures.length} 个问题` : toolSummary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-border/40 px-3 py-2">
        {contextPaths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dedupe(contextPaths).slice(0, 3).map((item) => (
              <span key={item} className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10.5px]">
                {formatContextPath(item)}
              </span>
            ))}
          </div>
        )}
        {changedPaths.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground/80">已修改</div>
            <div className="flex flex-wrap gap-1.5">
              {dedupe(changedPaths).slice(0, 6).map((item) => (
                <span key={item} className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10.5px]">
                  {formatContextPath(item)}
                </span>
              ))}
            </div>
          </div>
        )}
        {toolTrace.length > 0 && <div>{toolSummary}</div>}
        {visibleNotes.length > 0 && (
          <ul className="space-y-0.5">
            {visibleNotes.map((item, index) => (
              <li key={index}>- {item}</li>
            ))}
          </ul>
        )}
        {failures.length > 0 && (
          <ul className="space-y-0.5 text-destructive">
            {dedupe(failures).slice(0, 5).map((item, index) => (
              <li key={index}>- {item}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

function summarizeToolTrace(toolTrace: string[]): string {
  if (toolTrace.length === 0) return "处理完成"
  const counts = new Map<string, number>()
  for (const item of toolTrace) {
    const name = item.split(":")[0]?.trim() || "tool"
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  const readCount = counts.get("read_file") ?? 0
  const searchCount = (counts.get("glob") ?? 0) + (counts.get("grep") ?? 0)
  const writeCount = (counts.get("write_file") ?? 0) + (counts.get("edit_file") ?? 0)
  const otherCount = toolTrace.length - readCount - searchCount - writeCount
  const parts = [
    readCount > 0 ? `读取 ${readCount} 个文件` : "",
    searchCount > 0 ? `检索 ${searchCount} 次` : "",
    writeCount > 0 ? `写入 ${writeCount} 次` : "",
    otherCount > 0 ? `调用工具 ${otherCount} 次` : "",
  ].filter(Boolean)

  return parts.join("，") || `调用工具 ${toolTrace.length} 次`
}

function formatContextPath(item: string): string {
  const normalized = item.replace(/\\/g, "/")
  const marker = "/.lg-data/books/"
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex >= 0) return normalized.slice(markerIndex + marker.length)
  const parts = normalized.split("/").filter(Boolean)
  return parts.slice(-2).join("/") || item
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}
