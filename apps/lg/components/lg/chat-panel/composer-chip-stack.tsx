"use client"

import { XCircle } from "lucide-react"
import type { ResponseConstraint, Skill } from "@/lib/types"
import type { WorkflowAction } from "@/lib/types"
import { CitationBar, ResponseConstraintChipBar, SkillChipBar } from "./pickers"
import type { ChatCitation } from "./types"
import { getWorkflowActionMeta } from "./workflow-actions"

export function ComposerChipStack({
  activeResponseConstraints,
  temporaryConstraints,
  selectedSkills,
  workflowAction,
  citations,
  onRemoveConstraint,
  onRemoveTemporaryConstraint,
  onRemoveSkill,
  onClearWorkflowAction,
  onRemoveCitation,
  onClearCitations,
}: {
  activeResponseConstraints: ResponseConstraint[]
  temporaryConstraints: string[]
  selectedSkills: Skill[]
  workflowAction?: WorkflowAction
  citations: ChatCitation[]
  onRemoveConstraint: (constraintId: string) => void
  onRemoveTemporaryConstraint: (index: number) => void
  onRemoveSkill: (skillId: string) => void
  onClearWorkflowAction: () => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
}) {
  const workflowMeta = getWorkflowActionMeta(workflowAction)

  return (
    <>
      {workflowMeta && (
        <div className="border-b border-border/60 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">本轮动作</div>
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-[11px] text-foreground ring-1 ring-accent/30">
            <workflowMeta.Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span>{workflowMeta.label}</span>
            <span className="text-muted-foreground">{workflowMeta.command}</span>
            <button
              type="button"
              onClick={onClearWorkflowAction}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除本轮动作 ${workflowMeta.label}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
      {(activeResponseConstraints.length > 0 || temporaryConstraints.length > 0) && (
        <ResponseConstraintChipBar
          constraints={activeResponseConstraints}
          temporaryConstraints={temporaryConstraints}
          onRemoveConstraint={onRemoveConstraint}
          onRemoveTemporary={onRemoveTemporaryConstraint}
        />
      )}
      {selectedSkills.length > 0 && (
        <SkillChipBar
          skills={selectedSkills}
          onRemove={onRemoveSkill}
        />
      )}
      {citations.length > 0 && (
        <CitationBar
          citations={citations}
          onRemove={onRemoveCitation}
          onClear={onClearCitations}
        />
      )}
    </>
  )
}
