"use client"

import { memo } from "react"
import type { Message } from "@/lib/mock-data"
import { AssistantMessageBubble } from "./assistant-message-bubble"
import { UserMessageBubble } from "./user-message-bubble"

export const MessageBubble = memo(function MessageBubble({
  message,
  selected,
  streaming,
  isLatestUser,
  highlightedUser,
  registerUserMessage,
  onSelectTurn,
  onForkThread,
  onEditLatest,
  rollingBackLedgerEntryId,
  applyingProposalId,
  onRollbackLedgerEntry,
  onApplyProposal,
  onDiscardProposal,
}: {
  message: Message
  selected: boolean
  streaming: boolean
  isLatestUser: boolean
  highlightedUser: boolean
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
  onEditLatest: (content: string) => void
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
        isLatestUser={isLatestUser}
        highlightedUser={highlightedUser}
        registerUserMessage={registerUserMessage}
        onSelectTurn={onSelectTurn}
        onEditLatest={onEditLatest}
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
