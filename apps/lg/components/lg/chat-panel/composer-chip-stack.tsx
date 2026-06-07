"use client"

import type { ResponseConstraint, Skill } from "@/lib/types"
import { CitationBar, ResponseConstraintChipBar, SkillChipBar } from "./pickers"
import type { ChatCitation } from "./types"

export function ComposerChipStack({
  activeResponseConstraints,
  temporaryConstraints,
  selectedSkills,
  citations,
  onRemoveConstraint,
  onRemoveTemporaryConstraint,
  onRemoveSkill,
  onRemoveCitation,
  onClearCitations,
}: {
  activeResponseConstraints: ResponseConstraint[]
  temporaryConstraints: string[]
  selectedSkills: Skill[]
  citations: ChatCitation[]
  onRemoveConstraint: (constraintId: string) => void
  onRemoveTemporaryConstraint: (index: number) => void
  onRemoveSkill: (skillId: string) => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
}) {
  return (
    <>
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
