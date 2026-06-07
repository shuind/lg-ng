"use client"

import { Check } from "lucide-react"

export function ResponseConstraintDraftForm({
  draftTitle,
  draftInstruction,
  saving,
  onTitleChange,
  onInstructionChange,
  onCancel,
  onSave,
}: {
  draftTitle: string
  draftInstruction: string
  saving: boolean
  onTitleChange: (value: string) => void
  onInstructionChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mb-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2">
      <input
        value={draftTitle}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="标题"
        className="w-full rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring/50"
      />
      <textarea
        value={draftInstruction}
        onChange={(event) => onInstructionChange(event.target.value)}
        placeholder="指令"
        rows={3}
        className="w-full resize-none rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring/50"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!draftTitle.trim() || !draftInstruction.trim() || saving}
          className="inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] text-background transition hover:opacity-90 disabled:opacity-40"
        >
          <Check className="h-3 w-3" />
          保存
        </button>
      </div>
    </div>
  )
}
