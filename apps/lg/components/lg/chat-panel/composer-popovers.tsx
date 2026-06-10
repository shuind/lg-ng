"use client"

import type { ChatReference, ImportedMaterial, SettingCard } from "@/lib/types"
import type { ResponseConstraint, Skill } from "@/lib/types"
import { PlusPicker, ReferencePicker } from "./pickers"
import type { ChatCitation } from "./types"

export function ComposerPopovers({
  constraintPickerOpen,
  referencePickerOpen,
  plusTab,
  responseConstraints,
  activeResponseConstraintIds,
  skills,
  skillIds,
  settingCards,
  importedMaterials,
  citations,
  onTabChange,
  onToggleConstraint,
  onCreateResponseConstraint,
  onUpdateResponseConstraint,
  onDeleteResponseConstraint,
  onAddTemporaryConstraint,
  onToggleSkill,
  onAddCitation,
  onRemoveCitation,
}: {
  constraintPickerOpen: boolean
  referencePickerOpen: boolean
  plusTab: "constraints" | "skills"
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  skills: Skill[]
  skillIds: string[]
  settingCards: SettingCard[]
  importedMaterials: ImportedMaterial[]
  citations: ChatCitation[]
  onTabChange: (tab: "constraints" | "skills") => void
  onToggleConstraint: (constraintId: string) => void
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onAddTemporaryConstraint: (instruction: string) => void
  onToggleSkill: (skillId: string) => void
  onAddCitation: (reference: ChatReference) => void
  onRemoveCitation: (cardId: string) => void
}) {
  return (
    <>
      {constraintPickerOpen && (
        <PlusPicker
          tab={plusTab}
          onTabChange={onTabChange}
          constraints={responseConstraints}
          activeConstraintIds={activeResponseConstraintIds}
          onToggleConstraint={onToggleConstraint}
          onCreateConstraint={onCreateResponseConstraint}
          onUpdateConstraint={onUpdateResponseConstraint}
          onDeleteConstraint={onDeleteResponseConstraint}
          onAddTemporaryConstraint={onAddTemporaryConstraint}
          skills={skills}
          selectedSkillIds={skillIds}
          onToggleSkill={onToggleSkill}
        />
      )}
      {referencePickerOpen && (
        <ReferencePicker
          cards={settingCards}
          materials={importedMaterials}
          citations={citations}
          onAddCitation={onAddCitation}
          onRemoveCitation={onRemoveCitation}
        />
      )}
    </>
  )
}
