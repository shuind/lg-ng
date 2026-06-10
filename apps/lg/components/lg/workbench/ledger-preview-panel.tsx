"use client"

import type { LedgerEntry } from "@/lib/types"
import { DiffBlock } from "@/components/lg/chat-panel/diff-block"

export function LedgerPreviewPanel({ entry }: { entry: LedgerEntry | null }) {
  return (
    <div className="paper flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/60 backdrop-blur">
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="font-serif text-[14px] text-foreground">变更预览</div>
        <div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">
          {entry?.targetPath ?? "选择一条可恢复记录"}
        </div>
      </div>
      {entry?.diffPatch ? (
        <div className="min-h-0 flex-1 p-3">
          <DiffBlock
            patch={entry.diffPatch}
            variant="split"
            className="h-full"
            maxHeightClass="h-full"
          />
        </div>
      ) : entry?.beforeSnapshot ? (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-serif text-[12.5px] leading-[1.75] text-foreground/90">
          {entry.beforeSnapshot}
        </pre>
      ) : (
        <div className="p-4 text-[12px] leading-relaxed text-muted-foreground">
          点击时间线里的“查看变更”，这里会显示本次保存的左右对照 diff。没有 checkpoint 的记录需要按历史重建。
        </div>
      )}
      {entry?.beforeHash && (
        <div className="shrink-0 border-t border-border/60 p-4 text-[10.5px] leading-relaxed text-muted-foreground">
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
