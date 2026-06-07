"use client"

import { ChevronRight, FileText, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecentChangeEntry, RecentChangeItem } from "./recent-change-types"
import { formatChangeTime, formatFilePreview } from "./recent-changes"

export function RecentChangeItemRow({
  item,
  expanded,
  rollingBackEntryId,
  onOpenFile,
  onRollbackEntry,
  onToggleBatch,
}: {
  item: RecentChangeItem
  expanded: boolean
  rollingBackEntryId?: string | null
  onOpenFile: (path: string) => void
  onRollbackEntry: (entryId: string) => void
  onToggleBatch: (itemId: string) => void
}) {
  const isBatch = item.entries.length > 1 || item.files.length > 1
  const singleEntry = item.entries[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!isBatch) {
            onOpenFile(item.files[0]?.path ?? item.targetPath)
            return
          }
          onToggleBatch(item.id)
        }}
        className="group relative flex w-full gap-3 rounded-md py-2 pl-5 pr-9 text-left transition hover:bg-sidebar-accent/25"
        aria-expanded={isBatch ? expanded : undefined}
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
                  expanded && "rotate-90",
                )}
              />
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-foreground/90">
            {item.summary}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/55 transition group-hover:text-muted-foreground/75">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{formatFilePreview(item.files)}</span>
          </span>
        </span>
      </button>
      {!isBatch && singleEntry?.rollbackable && (
        <div className="absolute right-1 top-2">
          <RollbackButton
            entry={singleEntry}
            rollingBack={rollingBackEntryId === singleEntry.id}
            onRollbackEntry={onRollbackEntry}
          />
        </div>
      )}

      {isBatch && expanded && (
        <div className="ml-5 space-y-0.5 pb-1 pr-1">
          {item.entries.map((entry) => (
            <div key={entry.id} className="flex min-w-0 items-center gap-1 rounded-md hover:bg-sidebar-accent/30">
              <button
                type="button"
                onClick={() => onOpenFile(entry.path)}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground/70 transition hover:text-foreground"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{entry.path}</span>
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
      )}
    </div>
  )
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
      className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-sidebar-accent hover:text-foreground disabled:opacity-40"
      title="恢复到保存前"
      aria-label={`恢复 ${entry.name} 到保存前`}
    >
      <RotateCcw className={cn("h-3 w-3", rollingBack && "animate-spin")} />
    </button>
  )
}
