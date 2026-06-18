"use client"

import { useState } from "react"
import { ChevronDown, PenTool } from "lucide-react"
import type { WorkflowAction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { getWorkflowActionMeta, WORKFLOW_ACTIONS } from "./workflow-actions"

export function WorkflowActionMenu({
  workflowAction,
  disabled,
  onSelectWorkflowAction,
}: {
  workflowAction?: WorkflowAction
  disabled?: boolean
  onSelectWorkflowAction: (action: WorkflowAction) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = getWorkflowActionMeta(workflowAction)

  return (
    <div className="relative" data-chat-popover-keepopen="true">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-45",
          selected ? "bg-secondary text-foreground" : "text-muted-foreground",
        )}
        title="选择本轮要交给 AI 的写作动作"
        aria-label="选择本轮写作动作"
      >
        {selected ? <selected.Icon className="h-3.5 w-3.5" /> : <PenTool className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{selected ? selected.label : "本轮动作"}</span>
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-9 left-0 z-40 w-72 rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg">
          {WORKFLOW_ACTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectWorkflowAction(item.id)
                setOpen(false)
              }}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition hover:bg-secondary",
                workflowAction === item.id && "bg-secondary",
              )}
            >
              <item.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <span>{item.label}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{item.command}</span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
