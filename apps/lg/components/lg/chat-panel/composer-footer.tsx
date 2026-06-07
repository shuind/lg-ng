"use client"

import { ArrowUp, AtSign, ListChecks, Loader2, Plus, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { ToolBtn } from "./pickers"

export function ComposerFooter({
  input,
  sending,
  reviewing,
  activeThreadTitle,
  constraintPickerOpen,
  referencePickerOpen,
  onSend,
  onCancel,
  onReview,
  onToggleConstraintPicker,
  onToggleReferencePicker,
}: {
  input: string
  sending: boolean
  reviewing: boolean
  activeThreadTitle: string
  constraintPickerOpen: boolean
  referencePickerOpen: boolean
  onSend: () => void
  onCancel: () => void
  onReview: () => void
  onToggleConstraintPicker: () => void
  onToggleReferencePicker: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 pb-2.5">
      <div className="flex items-center gap-1" data-chat-popover-keepopen="true">
        <ToolBtn
          icon={<Plus className="h-3.5 w-3.5" />}
          label="约束 / Skill"
          active={constraintPickerOpen}
          onClick={onToggleConstraintPicker}
        />
        <ToolBtn
          icon={<AtSign className="h-3.5 w-3.5" />}
          label="引用设定"
          active={referencePickerOpen}
          onClick={onToggleReferencePicker}
        />
        <ToolBtn
          icon={reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
          label="体检"
          disabled={sending || reviewing}
          onClick={onReview}
        />
        <span className="ml-2 max-w-[180px] truncate text-[11px] text-muted-foreground/70">
          {activeThreadTitle}
        </span>
      </div>
      <button
        onClick={sending ? onCancel : onSend}
        disabled={!sending && !input.trim()}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition",
          sending || input.trim()
            ? "bg-foreground text-background hover:scale-105"
            : "bg-muted text-muted-foreground/50",
        )}
        aria-label={sending ? "停止" : "发送"}
      >
        {sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
      </button>
    </div>
  )
}
