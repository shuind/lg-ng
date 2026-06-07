"use client"

import { ArrowUp, AtSign, CheckCheck, Lightbulb, ListChecks, Loader2, MapPin, MessageCircle, PenLine, Plus, RefreshCw, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkflowAction } from "@/lib/types"
import { ToolBtn } from "./pickers"

export function ComposerFooter({
  input,
  sending,
  reviewing,
  activeThreadTitle,
  readonlyOnly,
  workflowAction,
  constraintPickerOpen,
  referencePickerOpen,
  onSend,
  onCancel,
  onReview,
  onToggleReadonly,
  onSelectWorkflowAction,
  onToggleConstraintPicker,
  onToggleReferencePicker,
}: {
  input: string
  sending: boolean
  reviewing: boolean
  activeThreadTitle: string
  readonlyOnly: boolean
  workflowAction?: WorkflowAction
  constraintPickerOpen: boolean
  referencePickerOpen: boolean
  onSend: () => void
  onCancel: () => void
  onReview: () => void
  onToggleReadonly: () => void
  onSelectWorkflowAction: (action: WorkflowAction) => void
  onToggleConstraintPicker: () => void
  onToggleReferencePicker: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 pb-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1" data-chat-popover-keepopen="true">
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
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="讨论模式"
          active={readonlyOnly}
          disabled={sending}
          onClick={onToggleReadonly}
        />
        <ToolBtn
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          label="/续写"
          active={workflowAction === "continue"}
          disabled={sending}
          onClick={() => onSelectWorkflowAction("continue")}
        />
        <ToolBtn
          icon={<PenLine className="h-3.5 w-3.5" />}
          label="/改稿"
          active={workflowAction === "revise"}
          disabled={sending}
          onClick={() => onSelectWorkflowAction("revise")}
        />
        <ToolBtn
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="/铺垫"
          active={workflowAction === "plant"}
          disabled={sending}
          onClick={() => onSelectWorkflowAction("plant")}
        />
        <ToolBtn
          icon={<CheckCheck className="h-3.5 w-3.5" />}
          label="/收线"
          active={workflowAction === "resolve"}
          disabled={sending}
          onClick={() => onSelectWorkflowAction("resolve")}
        />
        <ToolBtn
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          label="/卡点诊断"
          active={workflowAction === "diagnose"}
          disabled={sending}
          onClick={() => onSelectWorkflowAction("diagnose")}
        />
        <ToolBtn
          icon={<ListChecks className="h-3.5 w-3.5" />}
          label="/计划"
          active={workflowAction === "plan"}
          disabled={sending}
          onClick={() => onSelectWorkflowAction("plan")}
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
