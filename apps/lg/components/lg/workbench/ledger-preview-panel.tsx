"use client"

import type { LedgerEntry } from "@/lib/types"

export function LedgerPreviewPanel({ entry }: { entry: LedgerEntry | null }) {
  return (
    <div className="paper sticky top-0 max-h-[calc(100vh-120px)] overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="font-serif text-[14px] text-foreground">变更预览</div>
        <div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">
          {entry?.targetPath ?? "选择一条可恢复记录"}
        </div>
      </div>
      {entry?.diffPatch ? (
        <pre className="max-h-[calc(100vh-210px)] overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-[1.6] text-foreground/90">
          {entry.diffPatch}
        </pre>
      ) : entry?.beforeSnapshot ? (
        <pre className="max-h-[calc(100vh-210px)] overflow-auto whitespace-pre-wrap p-4 font-serif text-[12.5px] leading-[1.75] text-foreground/90">
          {entry.beforeSnapshot}
        </pre>
      ) : (
        <div className="p-4 text-[12px] leading-relaxed text-muted-foreground">
          点击时间线里的“查看变更”，这里会显示本次保存的 diff。没有 checkpoint 的记录需要按历史重建。
        </div>
      )}
      {entry?.beforeHash && (
        <div className="border-t border-border/60 p-4 text-[10.5px] leading-relaxed text-muted-foreground">
          <div className="font-mono">before: {entry.beforeHash}</div>
          <div className="font-mono">after: {entry.afterHash}</div>
          {entry.checkpointPath && (
            <div className="mt-1 font-mono">checkpoint: {entry.checkpointPath}</div>
          )}
        </div>
      )}
    </div>
  )
}
