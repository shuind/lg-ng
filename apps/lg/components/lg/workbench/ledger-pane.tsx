"use client"

import { useEffect, useState } from "react"
import { Clock3, Eye, RotateCcw } from "lucide-react"
import type { LedgerEntry } from "@/lib/types"
import { listLedgerEntries, rollbackLedgerEntry } from "@/lib/api"
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

  function canDirectRollback(entry: LedgerEntry): boolean {
    return Boolean(
      entry.beforeSnapshot ||
      entry.diffPatch ||
      (entry.beforeHash && entry.beforeHash === entry.baseCheckpointHash),
    )
  }

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
        {entries.map((e) => (
          <div
            key={e.id}
            className="paper rounded-lg border border-border/60 bg-card/60 px-4 py-3 backdrop-blur"
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">
                {new Date(e.timestamp).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">{e.action}</span>
              <span className="text-muted-foreground/60">by {e.actor}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-foreground/90">{e.summary}</div>
            <button
              onClick={() => onOpenFile(e.targetPath)}
              className="mt-0.5 block max-w-full truncate font-mono text-[10.5px] text-muted-foreground/70 transition hover:text-foreground"
            >
              {e.targetPath}
            </button>
            {(e.diffPatch || e.beforeSnapshot) && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setPreviewEntry(e)}
                  className="flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <Eye className="h-3 w-3" />
                  查看变更
                </button>
                {canDirectRollback(e) ? (
                  <button
                    onClick={() => handleRollback(e)}
                    disabled={rollingBackId === e.id}
                    className="flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {rollingBackId === e.id ? "恢复中…" : "恢复到保存前"}
                  </button>
                ) : (
                  <span className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">
                    需按历史重建
                  </span>
                )}
              </div>
            )}
          </div>
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
        <div className="paper sticky top-0 max-h-[calc(100vh-120px)] overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur">
          <div className="border-b border-border/60 px-4 py-3">
            <div className="font-serif text-[14px] text-foreground">变更预览</div>
            <div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">
              {previewEntry?.targetPath ?? "选择一条可恢复记录"}
            </div>
          </div>
          {previewEntry?.diffPatch ? (
            <pre className="max-h-[calc(100vh-210px)] overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-[1.6] text-foreground/90">
              {previewEntry.diffPatch}
            </pre>
          ) : previewEntry?.beforeSnapshot ? (
            <pre className="max-h-[calc(100vh-210px)] overflow-auto whitespace-pre-wrap p-4 font-serif text-[12.5px] leading-[1.75] text-foreground/90">
              {previewEntry.beforeSnapshot}
            </pre>
          ) : (
            <div className="p-4 text-[12px] leading-relaxed text-muted-foreground">
              点击时间线里的“查看变更”，这里会显示本次保存的 diff。没有 checkpoint 的记录需要按历史重建。
            </div>
          )}
          {previewEntry?.beforeHash && (
            <div className="border-t border-border/60 p-4 text-[10.5px] leading-relaxed text-muted-foreground">
              <div className="font-mono">before: {previewEntry.beforeHash}</div>
              <div className="font-mono">after: {previewEntry.afterHash}</div>
              {previewEntry.checkpointPath && (
                <div className="mt-1 font-mono">checkpoint: {previewEntry.checkpointPath}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

