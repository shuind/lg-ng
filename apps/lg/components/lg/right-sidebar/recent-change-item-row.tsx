"use client"

import { useState } from "react"
import { ChevronRight, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecentChangeEntry, RecentChangeItem, RecentChangeRegionKey } from "./recent-change-types"
import { formatChangeTime } from "./recent-changes"

const REGION_ORDER: RecentChangeRegionKey[] = ["body", "draft", "status", "outline", "setting", "other"]

export function RecentChangeItemRow({
  item,
  expanded,
  rollingBackEntryId,
  hideRegionChips = false,
  onOpenFile,
  onRollbackEntry,
  onToggleBatch,
}: {
  item: RecentChangeItem
  expanded: boolean
  rollingBackEntryId?: string | null
  hideRegionChips?: boolean
  onOpenFile: (path: string) => void
  onRollbackEntry: (entryId: string) => void
  onToggleBatch: (itemId: string) => void
}) {
  const isBatch = item.entries.length > 1 || item.files.length > 1
  const singleEntry = item.entries[0]
  const primaryFile = item.files[0]?.path ?? item.targetPath
  const groupedEntries = groupEntriesByRegion(item.entries)
  const [detailsVisible, setDetailsVisible] = useState(false)

  return (
    <div
      data-recent-change-row
      className="rounded-lg transition hover:bg-sidebar-accent/15 focus-within:bg-sidebar-accent/15"
      onMouseEnter={() => setDetailsVisible(true)}
      onMouseLeave={() => setDetailsVisible(false)}
      onFocus={() => setDetailsVisible(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDetailsVisible(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (!isBatch) {
            onOpenFile(primaryFile)
            return
          }
          onToggleBatch(item.id)
        }}
        className="flex w-full min-w-0 flex-col rounded-lg px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45"
        aria-expanded={isBatch ? expanded : undefined}
      >
        <span className="flex min-w-0 items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="shrink-0 rounded-md bg-sidebar-accent/45 px-1.5 py-0.5 text-[10.5px] font-medium text-foreground/75">
              {item.actionLabel}
            </span>
            {item.hasBodyRisk && (
              <span className="shrink-0 rounded-md border border-border/35 bg-background/35 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
                待审
              </span>
            )}
            {!hideRegionChips && item.regions.map((region) => (
                <span
                  key={region.key}
                  data-recent-change-region={region.key}
                  className="shrink-0 rounded-md bg-background/45 px-1.5 py-0.5 text-[10px] text-muted-foreground/75"
                >
                  {region.label} {region.count}
                </span>
              ))}
          </span>
          <span className="mt-0.5 shrink-0 font-mono text-[10.5px] text-muted-foreground/55">
            {formatChangeTime(item.timestamp)}
          </span>
          {isBatch && (
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 text-muted-foreground/50 transition",
                expanded && "rotate-90",
              )}
            />
          )}
        </span>
        <span className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-foreground/82">
          {compactRecentChangeSummary(item, isBatch, hideRegionChips)}
        </span>
      </button>

      {!isBatch && (
        <div
          data-recent-change-detail
          className={cn(
            "overflow-hidden px-2.5 transition-all duration-150",
            detailsVisible ? "max-h-8 pb-2 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenFile(primaryFile)}
              className="min-w-0 flex-1 truncate text-left font-mono text-[10.5px] text-muted-foreground/60 transition hover:text-foreground"
              title={primaryFile}
            >
              {primaryFile}
            </button>
            {singleEntry?.rollbackable && (
              <RollbackButton
                entry={singleEntry}
                rollingBack={rollingBackEntryId === singleEntry.id}
                onRollbackEntry={onRollbackEntry}
              />
            )}
          </div>
        </div>
      )}

      {isBatch && expanded && (
        <div data-recent-change-batch-details className="space-y-0.5 px-2.5 pb-2">
          {groupedEntries.length === 1 ? (
            <EntryPathList
              entries={groupedEntries[0].entries}
              rollingBackEntryId={rollingBackEntryId}
              onOpenFile={onOpenFile}
              onRollbackEntry={onRollbackEntry}
            />
          ) : (
            groupedEntries.map((group) => (
              <div key={group.key} data-recent-change-region-section={group.key} className="space-y-0.5">
                <div className="px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60">
                  {group.label} {group.entries.length}
                </div>
                <div className="pb-0.5 pl-2">
                  <EntryPathList
                    entries={group.entries}
                    rollingBackEntryId={rollingBackEntryId}
                    onOpenFile={onOpenFile}
                    onRollbackEntry={onRollbackEntry}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function compactRecentChangeSummary(item: RecentChangeItem, isBatch: boolean, hideRegionLabels: boolean): string {
  const summary = isBatch
    ? item.summary || formatCompactFileNames(item.files)
    : compactSingleChangeSummary(item)

  return hideRegionLabels ? stripRegionPrefixes(summary, item) : summary
}

function compactSingleChangeSummary(item: RecentChangeItem): string {
  const primaryFile = item.files[0]
  const fallback = primaryFile?.name || item.targetPath || item.summary || "未命名文件"
  let summary = item.summary.trim()

  if (!summary) return fallback

  for (const file of item.files) {
    if (file.path) {
      summary = replaceAllText(summary, file.path, file.name)
      summary = replaceAllText(summary, file.path.replace(/\\/g, "/"), file.name)
    }
  }

  summary = stripActionPrefix(summary, item)
  summary = summary.replace(/\s+/g, " ").trim()

  if (!summary || summary.includes("/") || summary.includes("\\")) {
    return fallback
  }

  return summary
}

function stripRegionPrefixes(summary: string, item: RecentChangeItem): string {
  let next = summary
  for (const region of item.regions) {
    next = replaceAllText(next, `${region.label}：`, "")
  }
  return next.trim()
}

function groupEntriesByRegion(entries: RecentChangeEntry[]): Array<{
  key: RecentChangeRegionKey
  label: string
  entries: RecentChangeEntry[]
}> {
  const byRegion = new Map<RecentChangeRegionKey, RecentChangeEntry[]>()

  for (const entry of entries) {
    const list = byRegion.get(entry.region) ?? []
    list.push(entry)
    byRegion.set(entry.region, list)
  }

  return REGION_ORDER.flatMap((key) => {
    const regionEntries = byRegion.get(key)
    return regionEntries?.length ? [{ key, label: regionLabel(key), entries: regionEntries }] : []
  })
}

function regionLabel(key: RecentChangeRegionKey): string {
  switch (key) {
    case "body":
      return "正文"
    case "draft":
      return "草稿"
    case "status":
      return "状态追踪"
    case "outline":
      return "大纲"
    case "setting":
      return "设定"
    default:
      return "其他"
  }
}

function formatCompactFileNames(files: RecentChangeItem["files"]): string {
  if (files.length === 0) return "未命名文件"
  return `${files
    .slice(0, 2)
    .map((file) => file.name)
    .join("、")}${files.length > 2 ? ` 等 ${files.length} 个文件` : ""}`
}

function EntryPathList({
  entries,
  rollingBackEntryId,
  onOpenFile,
  onRollbackEntry,
}: {
  entries: RecentChangeEntry[]
  rollingBackEntryId?: string | null
  onOpenFile: (path: string) => void
  onRollbackEntry: (entryId: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {entries.map((entry) => (
        <div key={entry.id} className="flex min-w-0 items-center gap-1 rounded-md hover:bg-sidebar-accent/25">
          <button
            type="button"
            onClick={() => onOpenFile(entry.path)}
            className="min-w-0 flex-1 truncate px-1.5 py-1 text-left font-mono text-[10.5px] text-muted-foreground/70 transition hover:text-foreground"
            title={entry.path}
          >
            {entry.path}
          </button>
          {entry.rollbackable && (
            <RollbackButton
              entry={entry}
              rollingBack={rollingBackEntryId === entry.id}
              onRollbackEntry={onRollbackEntry}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function stripActionPrefix(summary: string, item: RecentChangeItem): string {
  const escapedAction = escapeRegExp(item.actionLabel)
  return summary
    .replace(new RegExp(`^(AI|用户|系统)?\\s*${escapedAction}\\s*[:：-]?\\s*`, "i"), "")
    .replace(new RegExp(`^批量\\s*${escapedAction}\\s*[:：-]?\\s*`, "i"), "")
    .trim()
}

function replaceAllText(value: string, search: string, replacement: string): string {
  if (!search) return value
  return value.split(search).join(replacement)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function RollbackButton({
  entry,
  rollingBack,
  onRollbackEntry,
}: {
  entry: RecentChangeEntry
  rollingBack: boolean
  onRollbackEntry: (entryId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onRollbackEntry(entry.id)
      }}
      disabled={rollingBack}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/65 transition hover:bg-sidebar-accent hover:text-foreground disabled:opacity-40"
      title="恢复到保存前"
      aria-label={`恢复 ${entry.name} 到保存前`}
    >
      <RotateCcw className={cn("h-3 w-3", rollingBack && "animate-spin")} />
    </button>
  )
}
