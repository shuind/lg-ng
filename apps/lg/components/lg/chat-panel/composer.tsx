"use client"

import { forwardRef, memo, useImperativeHandle } from "react"
import type { ChatReference, ImportedMaterial, MessageContextWindow, SettingCard } from "@/lib/types"
import type { ResponseConstraint } from "@/lib/types"
import { ChatComposerPanel } from "./composer-panel"
import type { ChatCitation, ChatSendOptions } from "./types"
import { useChatComposerState } from "./use-chat-composer-state"

export type ChatComposerHandle = {
  editLatest: (text: string) => void
  focus: () => void
}

interface ChatComposerProps {
  bookId: string
  activeThreadId: string
  citations: ChatCitation[]
  settingCards: SettingCard[]
  importedMaterials: ImportedMaterial[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  contextWindow?: MessageContextWindow
  latestUserTurnId: string | null
  sendBlocked?: boolean
  onQuestionJump: () => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onAddCitation: (reference: ChatReference) => void
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
  citations,
  settingCards,
  importedMaterials,
  responseConstraints,
  activeResponseConstraintIds,
  contextWindow,
  latestUserTurnId,
  sendBlocked = false,
  onQuestionJump,
  onSend,
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
    sendBlocked,
    onSend,
    onClearCitations,
    onSetActiveResponseConstraintIds,
  })

  useImperativeHandle(ref, () => ({
    editLatest(text: string) {
      composer.editLatest(text)
    },
    focus() {
      composer.inputRef.current?.focus()
    },
  }), [composer])

  return (
    <ChatComposerPanel
      inputRef={composer.inputRef}
      input={composer.input}
      sending={composer.sending}
      sendBlocked={sendBlocked}
      latestUserTurnId={latestUserTurnId}
      activeResponseConstraints={composer.activeResponseConstraints}
      temporaryConstraints={composer.temporaryConstraints}
      selectedSkills={composer.selectedSkills}
      workflowAction={composer.workflowAction}
      citations={citations}
      constraintPickerOpen={composer.constraintPickerOpen}
      referencePickerOpen={composer.referencePickerOpen}
      plusTab={composer.plusTab}
      responseConstraints={responseConstraints}
      activeResponseConstraintIds={activeResponseConstraintIds}
      contextWindow={contextWindow}
      skills={composer.skills}
      skillIds={composer.skillIds}
      settingCards={settingCards}
      importedMaterials={importedMaterials}
      onInputChange={composer.setInput}
      onSend={composer.handleSend}
      onCancelSend={composer.handleCancelSend}
      onQuestionJump={onQuestionJump}
      onRemoveConstraint={composer.handleRemoveConstraint}
      onRemoveTemporaryConstraint={composer.handleRemoveTemporaryConstraint}
      onRemoveSkill={composer.handleRemoveSkill}
      onClearWorkflowAction={composer.handleClearWorkflowAction}
      onRemoveCitation={onRemoveCitation}
      onClearCitations={onClearCitations}
      onTabChange={composer.setPlusTab}
      onToggleConstraint={composer.handleToggleConstraint}
      onCreateResponseConstraint={onCreateResponseConstraint}
      onUpdateResponseConstraint={onUpdateResponseConstraint}
      onDeleteResponseConstraint={onDeleteResponseConstraint}
      onAddTemporaryConstraint={composer.handleAddTemporaryConstraint}
      onToggleSkill={composer.handleToggleSkill}
      onSelectWorkflowAction={composer.handleSelectWorkflowAction}
      onAddCitation={onAddCitation}
      onToggleConstraintPicker={composer.handleToggleConstraintPicker}
      onToggleReferencePicker={composer.handleToggleReferencePicker}
    />
  )
}))
