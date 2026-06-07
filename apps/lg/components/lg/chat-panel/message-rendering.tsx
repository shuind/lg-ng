"use client"

import { memo } from "react"
import type { Message, Turn } from "@/lib/mock-data"
import { EmptyState } from "./empty-state"
import { IntentAnalyzer } from "./intent-analyzer"
import { MessageBubble } from "./message-bubble"

interface ChatTranscriptProps {
  scrollRef: React.RefObject<HTMLDivElement | null>
  messages: Message[]
  runningTurn?: Turn
  selectedTurnId: string | null
  latestUserTurnId: string | null
  highlightedUserTurnId: string | null
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
  onEditLatest: (content: string) => void
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  onRollbackLedgerEntry: (entryId: string) => Promise<void>
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
}

export const ChatTranscript = memo(function ChatTranscript({
  scrollRef,
  messages,
  runningTurn,
  selectedTurnId,
  latestUserTurnId,
  highlightedUserTurnId,
  onSelectTurn,
  onForkThread,
  onEditLatest,
  registerUserMessage,
  rollingBackLedgerEntryId,
  applyingProposalId,
  onRollbackLedgerEntry,
  onApplyProposal,
  onDiscardProposal,
}: ChatTranscriptProps) {
  const streamingTurnId = runningTurn?.id ?? null
  const liveAssistant = streamingTurnId
    ? messages.find((message) => message.role === "assistant" && message.turnId === streamingTurnId)
    : undefined
  const hasLiveOutput = Boolean(
    liveAssistant && (
      liveAssistant.content.trim() ||
      (liveAssistant.events ?? []).length > 0
    ),
  )

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-8 pb-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        {messages.length === 0 && !runningTurn && <EmptyState />}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            selected={message.turnId === selectedTurnId}
            streaming={message.role === "assistant" && message.turnId === streamingTurnId}
            isLatestUser={message.role === "user" && message.turnId === latestUserTurnId}
            highlightedUser={message.role === "user" && message.turnId === highlightedUserTurnId}
            registerUserMessage={registerUserMessage}
            onSelectTurn={onSelectTurn}
            onForkThread={onForkThread}
            onEditLatest={onEditLatest}
            rollingBackLedgerEntryId={rollingBackLedgerEntryId}
            applyingProposalId={applyingProposalId}
            onRollbackLedgerEntry={onRollbackLedgerEntry}
            onApplyProposal={onApplyProposal}
            onDiscardProposal={onDiscardProposal}
          />
        ))}
        {runningTurn && !hasLiveOutput && <IntentAnalyzer />}
      </div>
    </div>
  )
})
