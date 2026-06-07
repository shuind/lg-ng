"use client"

import type { ReactNode } from "react"
import type { ResponseConstraint, Skill } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ResponseConstraintPicker } from "./response-constraint-picker"
import { SkillPicker } from "./skill-picker"

export function PlusPicker({
  tab,
  onTabChange,
  constraints,
  activeConstraintIds,
  onToggleConstraint,
  onCreateConstraint,
  onUpdateConstraint,
  onDeleteConstraint,
  onAddTemporaryConstraint,
  skills,
  selectedSkillIds,
  onToggleSkill,
}: {
  tab: "constraints" | "skills"
  onTabChange: (tab: "constraints" | "skills") => void
  constraints: ResponseConstraint[]
  activeConstraintIds: string[]
  onToggleConstraint: (constraintId: string) => void
  onCreateConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteConstraint: (constraintId: string) => Promise<void>
  onAddTemporaryConstraint: (instruction: string) => void
  skills: Skill[]
  selectedSkillIds: string[]
  onToggleSkill: (skillId: string) => void
}) {
  return (
    <div
      data-chat-popover-keepopen="true"
      className="border-b border-border/60 bg-popover/95 px-3 py-3 text-[12px] text-popover-foreground shadow-sm"
    >
      <div className="mb-3 inline-flex rounded-lg bg-muted/50 p-0.5">
        <PlusTabButton active={tab === "constraints"} onClick={() => onTabChange("constraints")}>
          约束
        </PlusTabButton>
        <PlusTabButton active={tab === "skills"} onClick={() => onTabChange("skills")}>
          Skill
        </PlusTabButton>
      </div>

      {tab === "constraints" ? (
        <ResponseConstraintPicker
          constraints={constraints}
          activeIds={activeConstraintIds}
          onToggle={onToggleConstraint}
          onCreate={onCreateConstraint}
          onUpdate={onUpdateConstraint}
          onDelete={onDeleteConstraint}
          onAddTemporary={onAddTemporaryConstraint}
        />
      ) : (
        <SkillPicker
          skills={skills}
          selectedIds={selectedSkillIds}
          onToggle={onToggleSkill}
        />
      )}
    </div>
  )
}

function PlusTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-[11px] transition",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
