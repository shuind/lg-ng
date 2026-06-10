"use client"

import { useEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Clock3 } from "lucide-react"
import type { LedgerEntry } from "@/lib/types"
import { listLedgerEntries, rollbackLedgerEntry } from "@/lib/api"
import { LedgerPreviewPanel } from "./ledger-preview-panel"
import { LedgerTimelineItem } from "./ledger-timeline-item"
import { canDirectRollback } from "./ledger-utils"
import { EmptyPane, LoadingPane } from "./shared"

export function LedgerPane({
  bookId,
  initialEntryId,
  onOpenFile,
  onChanged,
}: {
  bookId: string
  initialEntryId?: string
  onOpenFile: (path: string) => void
  onChanged: () => void
}) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [previewEntry, setPreviewEntry] = useState<LedgerEntry | null>(null)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
  })

  useEffect(() => {
    setLoading(true)
    listLedgerEntries(bookId, { limit: 50 })
      .then((response) => {
        setEntries(response.entries)
        setNextCursor(response.nextCursor)
        if (initialEntryId) {
          setPreviewEntry(response.entries.find((entry) => entry.id === initialEntryId) ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [bookId, initialEntryId])

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
    <div className="h-full min-h-0 overflow-hidden px-8 py-6">
      <div className="mx-auto grid h-full min-h-0 max-w-[1440px] gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col">
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <div>
              <div className="font-serif text-[16px] text-foreground">最近修改</div>
              <div className="mt-1 text-[12px] text-muted-foreground">设定与正文的写作时间线</div>
            </div>
            <span className="text-[11px] text-muted-foreground">{entries.length} 条</span>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
            <div
              className="relative"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index]
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <LedgerTimelineItem
                      entry={entry}
                      selected={previewEntry?.id === entry.id}
                      rollingBack={rollingBackId === entry.id}
                      onOpenFile={onOpenFile}
                      onPreview={setPreviewEntry}
                      onRollback={handleRollback}
                    />
                  </div>
                )
              })}
            </div>

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
        </div>

        <LedgerPreviewPanel entry={previewEntry} />
      </div>
    </div>
  )
}
