"use client"

import { Check, Edit3, Trash2 } from "lucide-react"
import type { ResponseConstraint } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ResponseConstraintItem({
  constraint,
  active,
  onToggle,
  onEdit,
  onDelete,
}: {
  constraint: ResponseConstraint
  active: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2 py-2 transition",
        active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
          active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
        )}
        aria-label={active ? `取消约束 ${constraint.title}` : `启用约束 ${constraint.title}`}
      >
        {active && <Check className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-[12px] font-medium text-foreground">{constraint.title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {constraint.instruction}
        </div>
      </button>
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={onEdit}
          className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label={`编辑 ${constraint.title}`}
        >
          <Edit3 className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label={`删除 ${constraint.title}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
