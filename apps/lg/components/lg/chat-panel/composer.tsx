"use client"

import { forwardRef, memo, useImperativeHandle } from "react"
import type { SettingCard } from "@/lib/mock-data"
import type { ResponseConstraint } from "@/lib/types"
import { ChatComposerPanel } from "./composer-panel"
import type { ChatCitation, ChatSendOptions } from "./types"
import { useChatComposerState } from "./use-chat-composer-state"

export type ChatComposerHandle = {
  editLatest: (text: string) => void
}

interface ChatComposerProps {
  bookId: string
  activeThreadId: string
  activeThreadTitle: string
  reviewing: boolean
  citations: ChatCitation[]
  settingCards: SettingCard[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  latestUserTurnId: string | null
  onQuestionJump: () => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onReview: () => Promise<void>
  onAddCitation: (card: SettingCard) => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onSetActiveResponseConstraintIds: (constraintIds: string[]) => Promise<void>
}

export const ChatComposer = memo(forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
  bookId,
  activeThreadId,
  activeThreadTitle,
  reviewing,
  citations,
  settingCards,
  responseConstraints,
  activeResponseConstraintIds,
  latestUserTurnId,
  onQuestionJump,
  onSend,
  onReview,
  onAddCitation,
  onRemoveCitation,
  onClearCitations,
  onCreateResponseConstraint,
  onUpdateResponseConstraint,
  onDeleteResponseConstraint,
  onSetActiveResponseConstraintIds,
}, ref) {
  const composer = useChatComposerState({
    bookId,
    activeThreadId,
    citations,
    responseConstraints,
    activeResponseConstraintIds,
    onSend,
    onClearCitations,
    onSetActiveResponseConstraintIds,
  })

  useImperativeHandle(ref, () => ({
    editLatest(text: string) {
      composer.editLatest(text)
    },
  }), [composer])

  return (
    <ChatComposerPanel
      inputRef={composer.inputRef}
      input={composer.input}
      sending={composer.sending}
      reviewing={reviewing}
      latestUserTurnId={latestUserTurnId}
      activeThreadTitle={activeThreadTitle}
      activeResponseConstraints={composer.activeResponseConstraints}
      temporaryConstraints={composer.temporaryConstraints}
      selectedSkills={composer.selectedSkills}
      readonlyOnly={composer.readonlyOnly}
      workflowAction={composer.workflowAction}
      citations={citations}
      constraintPickerOpen={composer.constraintPickerOpen}
      referencePickerOpen={composer.referencePickerOpen}
      plusTab={composer.plusTab}
      responseConstraints={responseConstraints}
      activeResponseConstraintIds={activeResponseConstraintIds}
      skills={composer.skills}
      skillIds={composer.skillIds}
      settingCards={settingCards}
      onInputChange={composer.setInput}
      onSend={composer.handleSend}
      onCancelSend={composer.handleCancelSend}
      onReview={onReview}
      onQuestionJump={onQuestionJump}
      onRemoveConstraint={composer.handleRemoveConstraint}
      onRemoveTemporaryConstraint={composer.handleRemoveTemporaryConstraint}
      onRemoveSkill={composer.handleRemoveSkill}
      onRemoveCitation={onRemoveCitation}
      onClearCitations={onClearCitations}
      onTabChange={composer.setPlusTab}
      onToggleConstraint={composer.handleToggleConstraint}
      onCreateResponseConstraint={onCreateResponseConstraint}
      onUpdateResponseConstraint={onUpdateResponseConstraint}
      onDeleteResponseConstraint={onDeleteResponseConstraint}
      onAddTemporaryConstraint={composer.handleAddTemporaryConstraint}
      onToggleSkill={composer.handleToggleSkill}
      onToggleReadonly={composer.handleToggleReadonly}
      onSelectWorkflowAction={composer.handleSelectWorkflowAction}
      onAddCitation={onAddCitation}
      onToggleConstraintPicker={composer.handleToggleConstraintPicker}
      onToggleReferencePicker={composer.handleToggleReferencePicker}
    />
  )
}))
