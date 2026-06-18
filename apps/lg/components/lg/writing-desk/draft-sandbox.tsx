"use client"

import { useState } from "react"
import { RefreshCw, Sparkles, Trash2 } from "lucide-react"
import type { ProposalSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

export function DraftSandbox({
  draft,
  proposal,
  generating,
  applyingProposal,
  onGenerate,
  onKeepDraft,
  onApplyProposal,
  onDiscardProposal,
  onClearDraft,
}: {
  draft: string
  proposal: ProposalSummary | null
  generating: boolean
  applyingProposal: boolean
  onGenerate: () => void
  onKeepDraft: () => void | Promise<void>
  onApplyProposal: (hunkIds?: string[]) => void | Promise<void>
  onDiscardProposal: () => void | Promise<void>
  onClearDraft: () => void
}) {
  const [selectedHunks, setSelectedHunks] = useState<Set<string>>(new Set())
  const activeSelected = selectedHunks.size > 0
    ? [...selectedHunks]
    : proposal?.hunks.map((hunk) => hunk.id) ?? []

  function toggleHunk(id: string) {
    setSelectedHunks((current) => {
      const next = new Set(current.size > 0 ? current : proposal?.hunks.map((hunk) => hunk.id) ?? [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="paper rounded-lg border border-dashed border-border bg-muted/20 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          试写沙盒
          <span className="text-[10px] opacity-60">临时区域，按意图启用可插拔 Skill</span>
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
      {proposal && (
        <div className="border-t border-border/60 px-4 py-3 text-[12px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate font-mono text-[11px] text-foreground/80">{proposal.targetPath}</div>
            <div className="rounded bg-background/70 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
              {formatProposalStatus(proposal.status)}
            </div>
          </div>
          <div className="space-y-1.5">
            {proposal.hunks.map((hunk) => (
              <label key={hunk.id} className="flex gap-2 rounded-md bg-background/60 p-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={activeSelected.includes(hunk.id)}
                  disabled={proposal.status !== "pending" || applyingProposal}
                  onChange={() => toggleHunk(hunk.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[10.5px] text-foreground/75">{hunk.id} @ {hunk.baseStartLine}</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{hunk.preview}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              disabled={proposal.status !== "pending" || applyingProposal || activeSelected.length === 0}
              onClick={() => onApplyProposal(activeSelected)}
              className="rounded-md bg-foreground px-2 py-1 text-[11px] text-background transition hover:opacity-90 disabled:opacity-45"
            >
              采纳所选
            </button>
            <button
              type="button"
              disabled={proposal.status !== "pending" || applyingProposal}
              onClick={() => onApplyProposal()}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-45"
            >
              全部采纳
            </button>
            <button
              type="button"
              disabled={proposal.status !== "pending" || applyingProposal}
              onClick={onDiscardProposal}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-destructive disabled:opacity-45"
            >
              丢弃
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatProposalStatus(status: ProposalSummary["status"]): string {
  if (status === "pending") return "待采纳"
  if (status === "applied") return "已采纳"
  if (status === "partially_applied") return "部分采纳"
  if (status === "discarded") return "已丢弃"
  return status
}
