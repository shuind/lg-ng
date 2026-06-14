"use client"

import { RotateCcw } from "lucide-react"
import type { LedgerEntry } from "@/lib/types"
import { cn } from "@/lib/utils"
import { canDirectRollback, formatLedgerSummary, formatLedgerTimestamp } from "./ledger-utils"

export function LedgerTimelineItem({
  entry,
  selected,
  rollingBack,
  onOpenFile,
  onPreview,
  onRollback,
}: {
  entry: LedgerEntry
  selected?: boolean
  rollingBack: boolean
  onOpenFile: (path: string) => void
  onPreview: (entry: LedgerEntry) => void
  onRollback: (entry: LedgerEntry) => void
}) {
  const summary = formatLedgerSummary(entry)
  const canPreview = Boolean(entry.diffPatch || entry.beforeSnapshot)
  const rollbackable = canDirectRollback(entry)

  function handlePreview() {
    if (canPreview) onPreview(entry)
  }

  function handlePreviewKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!canPreview) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onPreview(entry)
  }

  return (
    <div
      role={canPreview ? "button" : undefined}
      tabIndex={canPreview ? 0 : undefined}
      onClick={handlePreview}
      onKeyDown={handlePreviewKeyDown}
      className={cn(
        "paper rounded-lg border border-border/60 bg-card/60 px-4 py-3 backdrop-blur transition",
        canPreview && "cursor-pointer hover:border-border hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{formatLedgerTimestamp(entry.timestamp)}</span>
        <span className="text-muted-foreground/60">来源：{formatLedgerActor(entry.actor)}</span>
      </div>
      {summary && <div className="mt-1 text-[12.5px] text-foreground/90">{summary}</div>}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onOpenFile(entry.targetPath)
        }}
        className="mt-0.5 block max-w-full truncate font-mono text-[10.5px] text-muted-foreground/70 transition hover:text-foreground"
      >
        {entry.targetPath}
      </button>
      {rollbackable && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRollback(entry)
            }}
            disabled={rollingBack}
            className="flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            {rollingBack ? "恢复中…" : "恢复到保存前"}
          </button>
        </div>
      )}
    </div>
  )
}

function formatLedgerActor(actor: LedgerEntry["actor"]): string {
  if (actor === "agent") return "AI"
  if (actor === "user") return "用户"
  return actor
}
