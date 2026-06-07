"use client"

import { Eye, RotateCcw } from "lucide-react"
import type { LedgerEntry } from "@/lib/types"
import { canDirectRollback, formatLedgerTimestamp } from "./ledger-utils"

export function LedgerTimelineItem({
  entry,
  rollingBack,
  onOpenFile,
  onPreview,
  onRollback,
}: {
  entry: LedgerEntry
  rollingBack: boolean
  onOpenFile: (path: string) => void
  onPreview: (entry: LedgerEntry) => void
  onRollback: (entry: LedgerEntry) => void
}) {
  return (
    <div className="paper rounded-lg border border-border/60 bg-card/60 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{formatLedgerTimestamp(entry.timestamp)}</span>
        <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
          {entry.action}
        </span>
        <span className="text-muted-foreground/60">by {entry.actor}</span>
      </div>
      <div className="mt-1 text-[12.5px] text-foreground/90">{entry.summary}</div>
      <button
        type="button"
        onClick={() => onOpenFile(entry.targetPath)}
        className="mt-0.5 block max-w-full truncate font-mono text-[10.5px] text-muted-foreground/70 transition hover:text-foreground"
      >
        {entry.targetPath}
      </button>
      {(entry.diffPatch || entry.beforeSnapshot) && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPreview(entry)}
            className="flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Eye className="h-3 w-3" />
            查看变更
          </button>
          {canDirectRollback(entry) ? (
            <button
              type="button"
              onClick={() => onRollback(entry)}
              disabled={rollingBack}
              className="flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              {rollingBack ? "恢复中…" : "恢复到保存前"}
            </button>
          ) : (
            <span className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">
              需按历史重建
            </span>
          )}
        </div>
      )}
    </div>
  )
}
