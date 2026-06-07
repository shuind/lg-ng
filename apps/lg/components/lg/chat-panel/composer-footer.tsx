"use client"

import { ArrowUp, AtSign, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { ToolBtn } from "./pickers"

export function ComposerFooter({
  input,
  sending,
  activeThreadTitle,
  constraintPickerOpen,
  referencePickerOpen,
  onSend,
  onToggleConstraintPicker,
  onToggleReferencePicker,
}: {
  input: string
  sending: boolean
  activeThreadTitle: string
  constraintPickerOpen: boolean
  referencePickerOpen: boolean
  onSend: () => void
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
        <span className="ml-2 max-w-[180px] truncate text-[11px] text-muted-foreground/70">
          {activeThreadTitle}
        </span>
      </div>
      <button
        onClick={onSend}
        disabled={!input.trim() || sending}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition",
          input.trim() && !sending
            ? "bg-foreground text-background hover:scale-105"
            : "bg-muted text-muted-foreground/50",
        )}
        aria-label="发送"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
      </button>
    </div>
  )
}
