"use client"

import type { RefObject } from "react"
import type { SettingCard } from "@/lib/mock-data"
import type { ResponseConstraint, Skill } from "@/lib/types"
import { ComposerChipStack } from "./composer-chip-stack"
import { ComposerFooter } from "./composer-footer"
import { ComposerPopovers } from "./composer-popovers"
import { ComposerQuestionJump } from "./composer-question-jump"
import type { ChatCitation } from "./types"

export function ChatComposerPanel({
  inputRef,
  input,
  sending,
  reviewing,
  latestUserTurnId,
  activeThreadTitle,
  activeResponseConstraints,
  temporaryConstraints,
  selectedSkills,
  citations,
  constraintPickerOpen,
  referencePickerOpen,
  plusTab,
  responseConstraints,
  activeResponseConstraintIds,
  skills,
  skillIds,
  settingCards,
  onInputChange,
  onSend,
  onCancelSend,
  onReview,
  onQuestionJump,
  onRemoveConstraint,
  onRemoveTemporaryConstraint,
  onRemoveSkill,
  onRemoveCitation,
  onClearCitations,
  onTabChange,
  onToggleConstraint,
  onCreateResponseConstraint,
  onUpdateResponseConstraint,
  onDeleteResponseConstraint,
  onAddTemporaryConstraint,
  onToggleSkill,
  onAddCitation,
  onToggleConstraintPicker,
  onToggleReferencePicker,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  input: string
  sending: boolean
  reviewing: boolean
  latestUserTurnId: string | null
  activeThreadTitle: string
  activeResponseConstraints: ResponseConstraint[]
  temporaryConstraints: string[]
  selectedSkills: Skill[]
  citations: ChatCitation[]
  constraintPickerOpen: boolean
  referencePickerOpen: boolean
  plusTab: "constraints" | "skills"
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  skills: Skill[]
  skillIds: string[]
  settingCards: SettingCard[]
  onInputChange: (value: string) => void
  onSend: () => void
  onCancelSend: () => void
  onReview: () => void
  onQuestionJump: () => void
  onRemoveConstraint: (constraintId: string) => void
  onRemoveTemporaryConstraint: (index: number) => void
  onRemoveSkill: (skillId: string) => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
  onTabChange: (tab: "constraints" | "skills") => void
  onToggleConstraint: (constraintId: string) => void
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onAddTemporaryConstraint: (instruction: string) => void
  onToggleSkill: (skillId: string) => void
  onAddCitation: (card: SettingCard) => void
  onToggleConstraintPicker: () => void
  onToggleReferencePicker: () => void
}) {
  return (
    <div className="px-8 pb-6 pt-2">
      <div className="mx-auto max-w-2xl">
        <ComposerQuestionJump latestUserTurnId={latestUserTurnId} onQuestionJump={onQuestionJump} />
        <div className="paper relative rounded-2xl border border-border/70 bg-card/80 backdrop-blur transition focus-within:ring-1 focus-within:ring-ring/50 dark:bg-card/40 dark:border-border/50 dark:backdrop-blur-md">
          <ComposerChipStack
            activeResponseConstraints={activeResponseConstraints}
            temporaryConstraints={temporaryConstraints}
            selectedSkills={selectedSkills}
            citations={citations}
            onRemoveConstraint={onRemoveConstraint}
            onRemoveTemporaryConstraint={onRemoveTemporaryConstraint}
            onRemoveSkill={onRemoveSkill}
            onRemoveCitation={onRemoveCitation}
            onClearCitations={onClearCitations}
          />
          <ComposerPopovers
            constraintPickerOpen={constraintPickerOpen}
            referencePickerOpen={referencePickerOpen}
            plusTab={plusTab}
            responseConstraints={responseConstraints}
            activeResponseConstraintIds={activeResponseConstraintIds}
            skills={skills}
            skillIds={skillIds}
            settingCards={settingCards}
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
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
            disabled={sending}
            rows={2}
            placeholder="描述你想做的修改、新建,或粘贴一段设定..."
            className="w-full resize-none bg-transparent px-4 pb-2 pt-3.5 font-serif text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-70"
          />
          <ComposerFooter
            input={input}
            sending={sending}
            reviewing={reviewing}
            activeThreadTitle={activeThreadTitle}
            constraintPickerOpen={constraintPickerOpen}
            referencePickerOpen={referencePickerOpen}
            onSend={onSend}
            onCancel={onCancelSend}
            onReview={onReview}
            onToggleConstraintPicker={onToggleConstraintPicker}
            onToggleReferencePicker={onToggleReferencePicker}
          />
        </div>
        <p className="mt-2 px-1 text-center text-[10px] text-muted-foreground/60">
          按 Enter 发送 · Shift+Enter 换行 · 写入会记录到 Ledger
        </p>
      </div>
    </div>
  )
}
