"use client"

import { useEffect, useState } from "react"
import { Clock3 } from "lucide-react"
import type { LedgerEntry } from "@/lib/types"
import { listLedgerEntries, rollbackLedgerEntry } from "@/lib/api"
import { LedgerPreviewPanel } from "./ledger-preview-panel"
import { LedgerTimelineItem } from "./ledger-timeline-item"
import { canDirectRollback } from "./ledger-utils"
import { EmptyPane, LoadingPane } from "./shared"

export function LedgerPane({
  bookId,
  onOpenFile,
  onChanged,
}: {
  bookId: string
  onOpenFile: (path: string) => void
  onChanged: () => void
}) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [previewEntry, setPreviewEntry] = useState<LedgerEntry | null>(null)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    listLedgerEntries(bookId, { limit: 50 })
      .then((response) => {
        setEntries(response.entries)
        setNextCursor(response.nextCursor)
      })
      .finally(() => setLoading(false))
  }, [bookId])

  async function handleRollback(entry: LedgerEntry) {
    if (!canDirectRollback(entry)) return
    setRollingBackId(entry.id)
    try {
      await rollbackLedgerEntry(bookId, entry.id)
      const response = await listLedgerEntries(bookId, { limit: 50 })
      setEntries(response.entries)
      setNextCursor(response.nextCursor)
      setPreviewEntry(null)
      onChanged()
    } finally {
      setRollingBackId(null)
    }
  }

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const response = await listLedgerEntries(bookId, { limit: 50, cursor: nextCursor })
      setEntries((current) => [...current, ...response.entries])
      setNextCursor(response.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <LoadingPane />

  if (entries.length === 0) {
    return (
      <EmptyPane
        icon={<Clock3 className="h-5 w-5" />}
        title="写作时间线"
        desc="暂无修改记录。保存设定或正文后，会在这里形成可追溯的写作历史。"
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-10 py-6">
      <div className="mx-auto grid max-w-5xl gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-serif text-[16px] text-foreground">最近修改</div>
              <div className="mt-1 text-[12px] text-muted-foreground">设定与正文的写作时间线</div>
            </div>
            <span className="text-[11px] text-muted-foreground">{entries.length} 条</span>
          </div>

          {entries.map((entry) => (
            <LedgerTimelineItem
              key={entry.id}
              entry={entry}
              rollingBack={rollingBackId === entry.id}
              onOpenFile={onOpenFile}
              onPreview={setPreviewEntry}
              onRollback={handleRollback}
            />
          ))}

          {nextCursor && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="mt-3 flex w-full items-center justify-center rounded-md border border-border/60 bg-background/50 px-3 py-2 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              {loadingMore ? "加载中..." : "加载更多"}
            </button>
          )}
        </div>
        <LedgerPreviewPanel entry={previewEntry} />
      </div>
    </div>
  )
}
