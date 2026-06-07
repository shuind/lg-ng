"use client"

import { Plus, XCircle } from "lucide-react"
import type { ResponseConstraint } from "@/lib/types"

export function ResponseConstraintChipBar({
  constraints,
  temporaryConstraints,
  onRemoveConstraint,
  onRemoveTemporary,
}: {
  constraints: ResponseConstraint[]
  temporaryConstraints: string[]
  onRemoveConstraint: (constraintId: string) => void
  onRemoveTemporary: (index: number) => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">回复约束</div>
      <div className="flex flex-wrap gap-1.5">
        {constraints.map((constraint) => (
          <span
            key={constraint.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-foreground ring-1 ring-border/50"
          >
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{constraint.title}</span>
            <button
              type="button"
              onClick={() => onRemoveConstraint(constraint.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除回复约束 ${constraint.title}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
        {temporaryConstraints.map((instruction, index) => (
          <span
            key={`${instruction}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent/20 px-2 py-1 text-[11px] text-foreground ring-1 ring-accent/30"
          >
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">本轮: {instruction}</span>
            <button
              type="button"
              onClick={() => onRemoveTemporary(index)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="移除本轮临时约束"
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
