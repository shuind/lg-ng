"use client"

import { ChevronDown, FileText, ListChecks } from "lucide-react"
import type { AgentEvent, Message } from "@/lib/mock-data"
import { useWorkbenchOpen } from "@/components/lg/workbench-open-context"

export function RunDetailsCard({
  brief,
  events,
}: {
  brief?: Message["brief"]
  events: AgentEvent[]
}) {
  const workbench = useWorkbenchOpen()
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
  const resultEvents = events.filter((event) => event.resultPreview || event.durationMs || event.usage)
  const latestUsage = [...events].reverse().find((event) => event.usage)?.usage
  const toolSummary = summarizeToolTrace(toolTrace)
  const hasDetails = toolTrace.length > 0 || failures.length > 0 || visibleNotes.length > 0 || contextPaths.length > 0 || changedPaths.length > 0 || resultEvents.length > 0 || Boolean(latestUsage)

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
        {latestUsage && (
          <div className="rounded bg-background/60 px-2 py-1 font-mono text-[10.5px]">
            tokens p:{latestUsage.promptTokens} c:{latestUsage.completionTokens} total:{latestUsage.totalTokens}
          </div>
        )}
        {resultEvents.length > 0 && (
          <div className="space-y-1">
            {resultEvents.slice(-6).map((event) => {
              const evidenceLinks = extractEvidenceLinks(event)
              return (
                <div key={event.id} className="rounded bg-background/60 px-2 py-1">
                  <div className="flex items-center gap-2 font-mono text-[10.5px] text-foreground/80">
                    <span>{event.name ?? event.type}</span>
                    {typeof event.durationMs === "number" && <span>{event.durationMs}ms</span>}
                  </div>
                  {event.resultPreview && (
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">
                      {event.resultPreview}
                    </div>
                  )}
                  {evidenceLinks.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {evidenceLinks.map((link, index) => (
                        <button
                          key={`${link.path}:${link.line ?? 0}:${index}`}
                          type="button"
                          disabled={!workbench}
                          onClick={(clickEvent) => {
                            clickEvent.preventDefault()
                            clickEvent.stopPropagation()
                            workbench?.openPath(link.path)
                          }}
                          className="flex w-full min-w-0 items-start gap-1.5 rounded border border-border/40 bg-background/70 px-2 py-1 text-left transition hover:border-border hover:bg-secondary/60 disabled:cursor-default disabled:opacity-60"
                          title={link.line ? `${link.path}:${link.line}` : link.path}
                        >
                          <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[10.5px] text-foreground/80">
                              {formatContextPath(link.path)}
                              {link.line ? `:${link.line}` : ""}
                            </span>
                            {link.excerpt && (
                              <span className="mt-0.5 block line-clamp-1 text-[10.5px] leading-relaxed">
                                {link.excerpt}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
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

interface EvidenceLink {
  path: string
  line?: number
  excerpt?: string
}

function extractEvidenceLinks(event: AgentEvent): EvidenceLink[] {
  const preview = event.resultPreview?.trim()
  if (!preview) return []

  const links = [
    ...extractReadFileEvidence(preview),
    ...extractSearchCanonEvidence(preview),
    ...extractGrepEvidence(preview),
  ]

  return dedupeEvidenceLinks(links).slice(0, 3)
}

function extractReadFileEvidence(preview: string): EvidenceLink[] {
  const match = preview.match(/File:\s+(.+?)\s+Lines:\s+(\d+)-/i)
  if (!match?.[1]) return []
  return [{
    path: match[1].trim(),
    line: match[2] ? Number(match[2]) : undefined,
  }]
}

function extractSearchCanonEvidence(preview: string): EvidenceLink[] {
  const parsed = parseJsonObject(preview)
  if (parsed && Array.isArray(parsed.hits)) {
    return parsed.hits.flatMap((hit) => {
      if (!isRecord(hit) || typeof hit.path !== "string") return []
      return [{
        path: hit.path,
        line: typeof hit.line === "number" ? hit.line : undefined,
        excerpt: typeof hit.excerpt === "string" ? hit.excerpt : undefined,
      }]
    })
  }

  const links: EvidenceLink[] = []
  const hitPattern = /"path"\s*:\s*"([^"]+)"\s*,\s*"line"\s*:\s*(\d+)/g
  for (const match of preview.matchAll(hitPattern)) {
    if (!match[1]) continue
    links.push({
      path: match[1],
      line: match[2] ? Number(match[2]) : undefined,
      excerpt: extractJsonExcerptNear(preview, match.index ?? 0),
    })
  }
  return links
}

function extractGrepEvidence(preview: string): EvidenceLink[] {
  const links: EvidenceLink[] = []
  const pathPattern = String.raw`([^:\n]+?\.(?:md|txt|json|tsx?|jsx?))`
  const grepPattern = new RegExp(`${pathPattern}:(\\d+):\\s*([\\s\\S]*?)(?=\\s+${pathPattern}:\\d+:|$)`, "g")
  for (const match of preview.matchAll(grepPattern)) {
    if (!match[1]) continue
    links.push({
      path: match[1].trim(),
      line: match[2] ? Number(match[2]) : undefined,
      excerpt: match[3]?.trim().slice(0, 160),
    })
  }
  return links
}

function extractJsonExcerptNear(preview: string, index: number): string | undefined {
  const snippet = preview.slice(index, index + 500)
  const match = snippet.match(/"excerpt"\s*:\s*"([^"]+)"/)
  return match?.[1]
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function dedupeEvidenceLinks(links: EvidenceLink[]): EvidenceLink[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    if (!link.path) return false
    const key = `${link.path}:${link.line ?? ""}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
