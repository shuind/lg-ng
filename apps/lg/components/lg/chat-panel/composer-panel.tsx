"use client"

import { useEffect, useMemo, useState } from "react"
import type { RefObject } from "react"
import type { ChatReference, ImportedMaterial, SettingCard } from "@/lib/types"
import type { ResponseConstraint, Skill, WorkflowAction } from "@/lib/types"
import { ComposerChipStack } from "./composer-chip-stack"
import { ComposerFooter } from "./composer-footer"
import { ComposerPopovers } from "./composer-popovers"
import { ComposerQuestionJump } from "./composer-question-jump"
import type { ChatCitation } from "./types"
import { WORKFLOW_ACTIONS } from "./workflow-actions"

export function ChatComposerPanel({
  inputRef,
  input,
  sending,
  sendBlocked,
  latestUserTurnId,
  activeThreadTitle,
  activeResponseConstraints,
  temporaryConstraints,
  selectedSkills,
  readonlyOnly,
  workflowAction,
  citations,
  constraintPickerOpen,
  referencePickerOpen,
  plusTab,
  responseConstraints,
  activeResponseConstraintIds,
  skills,
  skillIds,
  settingCards,
  importedMaterials,
  onInputChange,
  onSend,
  onCancelSend,
  onQuestionJump,
  onRemoveConstraint,
  onRemoveTemporaryConstraint,
  onRemoveSkill,
  onClearWorkflowAction,
  onRemoveCitation,
  onClearCitations,
  onTabChange,
  onToggleConstraint,
  onCreateResponseConstraint,
  onUpdateResponseConstraint,
  onDeleteResponseConstraint,
  onAddTemporaryConstraint,
  onToggleSkill,
  onToggleReadonly,
  onSelectWorkflowAction,
  onInsertSkillEvidencePrompt,
  onAddCitation,
  onToggleConstraintPicker,
  onToggleReferencePicker,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  input: string
  sending: boolean
  sendBlocked: boolean
  latestUserTurnId: string | null
  activeThreadTitle: string
  activeResponseConstraints: ResponseConstraint[]
  temporaryConstraints: string[]
  selectedSkills: Skill[]
  readonlyOnly: boolean
  workflowAction?: WorkflowAction
  citations: ChatCitation[]
  constraintPickerOpen: boolean
  referencePickerOpen: boolean
  plusTab: "constraints" | "skills"
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  skills: Skill[]
  skillIds: string[]
  settingCards: SettingCard[]
  importedMaterials: ImportedMaterial[]
  onInputChange: (value: string) => void
  onSend: () => void
  onCancelSend: () => void
  onQuestionJump: () => void
  onRemoveConstraint: (constraintId: string) => void
  onRemoveTemporaryConstraint: (index: number) => void
  onRemoveSkill: (skillId: string) => void
  onClearWorkflowAction: () => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
  onTabChange: (tab: "constraints" | "skills") => void
  onToggleConstraint: (constraintId: string) => void
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onAddTemporaryConstraint: (instruction: string) => void
  onToggleSkill: (skillId: string) => void
  onToggleReadonly: () => void
  onSelectWorkflowAction: (action: WorkflowAction) => void
  onInsertSkillEvidencePrompt: () => void
  onAddCitation: (reference: ChatReference) => void
  onToggleConstraintPicker: () => void
  onToggleReferencePicker: () => void
}) {
  const [slashDismissed, setSlashDismissed] = useState(false)
  const slashQuery = input.startsWith("/") && !input.includes("\n")
    ? input.slice(1).trim()
    : null
  const slashActions = useMemo(() => {
    if (slashQuery === null) return []
    return WORKFLOW_ACTIONS.filter((action) =>
      action.command.includes(slashQuery) ||
      action.label.includes(slashQuery) ||
      action.description.includes(slashQuery),
    )
  }, [slashQuery])
  const slashOpen = slashQuery !== null && slashActions.length > 0 && !slashDismissed

  useEffect(() => {
    setSlashDismissed(false)
  }, [input])

  const hasComposerChips = Boolean(
    workflowAction ||
    activeResponseConstraints.length > 0 ||
    temporaryConstraints.length > 0 ||
    selectedSkills.length > 0 ||
    citations.length > 0,
  )

  function selectSlashAction(action: WorkflowAction) {
    onSelectWorkflowAction(action)
    onInputChange("")
  }

  return (
    <div className="px-8 pb-4 pt-1">
      <div className="mx-auto max-w-2xl">
        <ComposerQuestionJump latestUserTurnId={latestUserTurnId} onQuestionJump={onQuestionJump} />
        <div className="paper relative rounded-lg border border-border/70 bg-card/80 backdrop-blur transition focus-within:ring-1 focus-within:ring-ring/50 dark:bg-card/40 dark:border-border/50 dark:backdrop-blur-md">
          {hasComposerChips && (
            <div className="max-h-28 overflow-y-auto scrollbar-thin">
              <ComposerChipStack
                activeResponseConstraints={activeResponseConstraints}
                temporaryConstraints={temporaryConstraints}
                selectedSkills={selectedSkills}
                workflowAction={workflowAction}
                citations={citations}
                onRemoveConstraint={onRemoveConstraint}
                onRemoveTemporaryConstraint={onRemoveTemporaryConstraint}
                onRemoveSkill={onRemoveSkill}
                onClearWorkflowAction={onClearWorkflowAction}
                onRemoveCitation={onRemoveCitation}
                onClearCitations={onClearCitations}
              />
            </div>
          )}
          <ComposerPopovers
            constraintPickerOpen={constraintPickerOpen}
            referencePickerOpen={referencePickerOpen}
            plusTab={plusTab}
            responseConstraints={responseConstraints}
            activeResponseConstraintIds={activeResponseConstraintIds}
            skills={skills}
            skillIds={skillIds}
            settingCards={settingCards}
            importedMaterials={importedMaterials}
            citations={citations}
            onTabChange={onTabChange}
            onToggleConstraint={onToggleConstraint}
            onCreateResponseConstraint={onCreateResponseConstraint}
            onUpdateResponseConstraint={onUpdateResponseConstraint}
            onDeleteResponseConstraint={onDeleteResponseConstraint}
            onAddTemporaryConstraint={onAddTemporaryConstraint}
            onToggleSkill={onToggleSkill}
            onAddCitation={onAddCitation}
            onRemoveCitation={onRemoveCitation}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                if (slashOpen) {
                  setSlashDismissed(true)
                } else if (sending) {
                  onCancelSend()
                }
                return
              }
              if (event.key === "Enter" && slashOpen) {
                event.preventDefault()
                selectSlashAction(slashActions[0].id)
                return
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                onSend()
                return
              }
              if (event.key === "Enter" && !event.shiftKey && !slashOpen) {
                event.preventDefault()
                onSend()
              }
            }}
            onBlur={() => setSlashDismissed(true)}
            onFocus={() => {
              if (input.startsWith("/")) setSlashDismissed(false)
            }}
            rows={1}
            placeholder="描述你想做的修改、新建,或粘贴一段设定..."
            className="min-h-[52px] max-h-36 w-full resize-none overflow-y-auto bg-transparent px-4 pb-1.5 pt-3 font-serif text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-70 scrollbar-thin"
          />
          {slashOpen && (
            <div
              className="absolute bottom-10 left-3 right-3 z-30 rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg"
              data-chat-popover-keepopen="true"
            >
              {slashActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSlashAction(action.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-secondary"
                >
                  <action.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-foreground">{action.command}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <ComposerFooter
            input={input}
            sending={sending}
            sendBlocked={sendBlocked}
            activeThreadTitle={activeThreadTitle}
            readonlyOnly={readonlyOnly}
            workflowAction={workflowAction}
            constraintPickerOpen={constraintPickerOpen}
            referencePickerOpen={referencePickerOpen}
            onSend={onSend}
            onCancel={onCancelSend}
            onToggleReadonly={onToggleReadonly}
            onSelectWorkflowAction={onSelectWorkflowAction}
            onInsertSkillEvidencePrompt={onInsertSkillEvidencePrompt}
            onToggleConstraintPicker={onToggleConstraintPicker}
            onToggleReferencePicker={onToggleReferencePicker}
          />
        </div>
      </div>
    </div>
  )
}
