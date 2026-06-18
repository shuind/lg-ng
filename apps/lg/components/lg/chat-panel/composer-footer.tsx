"use client"

import { ArrowUp, AtSign, ListChecks, Plus, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessageContextWindow, WorkflowAction } from "@/lib/types"
import { ContextWindowIndicator } from "./context-window-indicator"
import { ToolBtn } from "./pickers"
import { WorkflowActionMenu } from "./workflow-action-menu"

export function ComposerFooter({
  input,
  sending,
  sendBlocked,
  contextWindow,
  workflowAction,
  constraintPickerOpen,
  referencePickerOpen,
  onSend,
  onCancel,
  onSelectWorkflowAction,
  onToggleConstraintPicker,
  onToggleReferencePicker,
}: {
  input: string
  sending: boolean
  sendBlocked: boolean
  contextWindow?: MessageContextWindow
  workflowAction?: WorkflowAction
  constraintPickerOpen: boolean
  referencePickerOpen: boolean
  onSend: () => void
  onCancel: () => void
  onSelectWorkflowAction: (action: WorkflowAction) => void
  onToggleConstraintPicker: () => void
  onToggleReferencePicker: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
      <div className="flex min-w-0 items-center gap-1" data-chat-popover-keepopen="true">
        <ToolBtn
          icon={<Plus className="h-3.5 w-3.5" />}
          label="Skill"
          active={constraintPickerOpen}
          showLabel
          onClick={onToggleConstraintPicker}
        />
        <ToolBtn
          icon={<AtSign className="h-3.5 w-3.5" />}
          label="引用"
          active={referencePickerOpen}
          showLabel
          onClick={onToggleReferencePicker}
        />
        <ToolBtn
          icon={<ListChecks className="h-3.5 w-3.5" />}
          label="Plan"
          active={workflowAction === "plan"}
          disabled={sending}
          showLabel
          onClick={() => onSelectWorkflowAction("plan")}
        />
        <WorkflowActionMenu
          workflowAction={workflowAction}
          disabled={sending}
          onSelectWorkflowAction={onSelectWorkflowAction}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <ContextWindowIndicator contextWindow={contextWindow} />
        <button
          onClick={sending ? onCancel : onSend}
          disabled={!sending && (sendBlocked || !input.trim())}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full transition",
            sending || (input.trim() && !sendBlocked)
              ? "bg-foreground text-background hover:scale-105"
              : "bg-muted text-muted-foreground/50",
          )}
          title={!sending && sendBlocked ? "上一轮还在运行" : undefined}
          aria-label={sending ? "停止" : "发送"}
        >
          {sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
