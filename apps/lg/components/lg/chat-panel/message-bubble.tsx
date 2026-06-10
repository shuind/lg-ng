"use client"

import { memo } from "react"
import type { Message } from "@/lib/types"
import { AssistantMessageBubble } from "./assistant-message-bubble"
import type { TurnBranchNavigation } from "./types"
import { UserMessageBubble } from "./user-message-bubble"

export const MessageBubble = memo(function MessageBubble({
  message,
  selected,
  streaming,
  highlightedUser,
  branchNavigation,
  registerUserMessage,
  onSelectTurn,
  onForkThread,
  onSelectTurnBranch,
  onSubmitEditedTurn,
  rollingBackLedgerEntryId,
  applyingProposalId,
  onRollbackLedgerEntry,
  onApplyProposal,
  onDiscardProposal,
}: {
  message: Message
  selected: boolean
  streaming: boolean
  highlightedUser: boolean
  branchNavigation?: TurnBranchNavigation
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
  onSelectTurnBranch: (turnId: string) => void
  onSubmitEditedTurn: (turnId: string, content: string) => Promise<void>
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  onRollbackLedgerEntry: (entryId: string) => Promise<void>
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
}) {
  if (message.role === "user") {
    return (
      <UserMessageBubble
        message={message}
        selected={selected}
        highlightedUser={highlightedUser}
        branchNavigation={branchNavigation}
        registerUserMessage={registerUserMessage}
        onSelectTurn={onSelectTurn}
        onSelectTurnBranch={onSelectTurnBranch}
        onSubmitEditedTurn={onSubmitEditedTurn}
      />
    )
  }

  return (
    <AssistantMessageBubble
      message={message}
      selected={selected}
      streaming={streaming}
      onSelectTurn={onSelectTurn}
      onForkThread={onForkThread}
      rollingBackLedgerEntryId={rollingBackLedgerEntryId}
      applyingProposalId={applyingProposalId}
      onRollbackLedgerEntry={onRollbackLedgerEntry}
      onApplyProposal={onApplyProposal}
      onDiscardProposal={onDiscardProposal}
    />
  )
})
