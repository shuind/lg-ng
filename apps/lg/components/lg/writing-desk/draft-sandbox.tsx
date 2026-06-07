"use client"

import { RefreshCw, Sparkles, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function DraftSandbox({
  draft,
  generating,
  onGenerate,
  onKeepDraft,
  onClearDraft,
}: {
  draft: string
  generating: boolean
  onGenerate: () => void
  onKeepDraft: () => void
  onClearDraft: () => void
}) {
  return (
    <div className="paper rounded-xl border border-dashed border-border bg-muted/20 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          试写沙盒
          <span className="text-[10px] opacity-60">临时区域,不写入设定</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1 rounded-md bg-card px-2 py-1 text-[11px] text-foreground ring-1 ring-border transition hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", generating && "animate-spin")} />
            {draft ? "继续生成" : "AI 试写"}
          </button>
          {draft && (
            <>
              <button
                type="button"
                onClick={onKeepDraft}
                className="rounded-md bg-foreground px-2 py-1 text-[11px] text-background transition hover:opacity-90"
              >
                保留到草稿
              </button>
              <button
                type="button"
                onClick={onClearDraft}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                扔掉
              </button>
            </>
          )}
        </div>
      </div>
      <div className="min-h-[120px] max-h-[28vh] overflow-y-auto px-6 py-4 font-serif text-[14px] leading-relaxed text-muted-foreground">
        {draft || (
          <span className="italic opacity-60">
            点击「AI 试写」让 Agent 续写一段,满意再保留到正文。
          </span>
        )}
      </div>
    </div>
  )
}
