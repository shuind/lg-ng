"use client"

import { CornerUpLeft } from "lucide-react"

export function ComposerQuestionJump({
  latestUserTurnId,
  onQuestionJump,
}: {
  latestUserTurnId: string | null
  onQuestionJump: () => void
}) {
  return (
    <div className="mb-2 flex justify-end">
      <button
        type="button"
        onClick={onQuestionJump}
        disabled={!latestUserTurnId}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-3 text-[12px] text-muted-foreground shadow-sm backdrop-blur transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        title="跳到提问"
        aria-label="跳到提问"
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
        <span>跳到提问</span>
      </button>
    </div>
  )
}
