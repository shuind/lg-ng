"use client"

import { useState } from "react"
import { ChevronRight, FileText } from "lucide-react"
import type { LedgerEntry } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  buildRecentChangeGroups,
  formatChangeTime,
  formatFilePreview,
} from "./recent-changes"

export function RecentChangesView({
  entries,
  onOpenFile,
}: {
  entries: LedgerEntry[]
  onOpenFile: (path: string) => void
}) {
  const recentEntries = entries.slice(0, 24)
  const groups = buildRecentChangeGroups(recentEntries)
  const [dateGroupOpenOverrides, setDateGroupOpenOverrides] = useState<Record<string, boolean>>({})
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set())

  if (recentEntries.length === 0) {
    return (
      <div className="mt-14 text-center text-[12px] leading-relaxed text-muted-foreground/65">
        暂无改动记录。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const groupOpen = dateGroupOpenOverrides[group.key] ?? group.defaultOpen

        return (
          <section key={group.key} className="space-y-1">
            <button
              type="button"
              onClick={() =>
                setDateGroupOpenOverrides((current) => ({
                  ...current,
                  [group.key]: !groupOpen,
                }))
              }
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] text-muted-foreground transition hover:bg-sidebar-accent/25 hover:text-foreground"
              aria-expanded={groupOpen}
            >
              <ChevronRight
                className={cn("h-3 w-3 shrink-0 transition", groupOpen && "rotate-90")}
              />
              <span className="font-medium text-foreground/80">{group.label}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                {group.entryCount} 条 · {group.fileCount} 文件
              </span>
            </button>

            {groupOpen && (
              <div className="relative">
                <div className="absolute bottom-3 left-[7px] top-3 w-px bg-border/30" />
                {group.items.map((item) => {
                  const isBatch = item.files.length > 1
                  const batchExpanded = expandedBatchIds.has(item.id)

                  return (
                    <div key={item.id} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isBatch) {
                            onOpenFile(item.files[0]?.path ?? item.targetPath)
                            return
                          }
                          setExpandedBatchIds((current) => {
                            const next = new Set(current)
                            if (next.has(item.id)) {
                              next.delete(item.id)
                            } else {
                              next.add(item.id)
                            }
                            return next
                          })
                        }}
                        className="group relative flex w-full gap-3 rounded-md py-2 pl-5 pr-2 text-left transition hover:bg-sidebar-accent/25"
                        aria-expanded={isBatch ? batchExpanded : undefined}
                      >
                        <span className="absolute left-[4.5px] top-[16px] h-[7px] w-[7px] rounded-full border border-border/70 bg-sidebar shadow-[0_0_0_2px_var(--sidebar)] transition group-hover:border-foreground/35" />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="shrink-0">{item.actorLabel}</span>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <span className="shrink-0">{item.actionLabel}</span>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <span className="shrink-0">{item.files.length} 个文件</span>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <span className="shrink-0 font-mono">{formatChangeTime(item.timestamp)}</span>
                            {isBatch && (
                              <ChevronRight
                                className={cn(
                                  "ml-auto h-3 w-3 shrink-0 text-muted-foreground/55 transition",
                                  batchExpanded && "rotate-90",
                                )}
                              />
                            )}
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-foreground/90">
                            {item.summary}
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/55 transition group-hover:text-muted-foreground/75">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">
                              {formatFilePreview(item.files)}
                            </span>
                          </span>
                        </span>
                      </button>

                      {isBatch && batchExpanded && (
                        <div className="ml-5 space-y-0.5 pb-1 pr-1">
                          {item.files.map((file) => (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => onOpenFile(file.path)}
                              className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground/70 transition hover:bg-sidebar-accent/30 hover:text-foreground"
                            >
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{file.path}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
