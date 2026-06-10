"use client"

import { memo, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Message, Turn } from "@/lib/types"
import { ActivityIndicator } from "./activity-indicator"
import { EmptyState } from "./empty-state"
import { MessageBubble } from "./message-bubble"
import type { TurnBranchNavigation } from "./types"

interface ChatTranscriptProps {
  scrollRef: React.RefObject<HTMLDivElement | null>
  liveTailRef: React.RefObject<HTMLDivElement | null>
  messages: Message[]
  runningTurn?: Turn
  selectedTurnId: string | null
  highlightedUserTurnId: string | null
  turnBranchNavigation: Record<string, TurnBranchNavigation>
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
  onSelectTurnBranch: (turnId: string) => void
  onSubmitEditedTurn: (turnId: string, content: string) => Promise<void>
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  onRollbackLedgerEntry: (entryId: string) => Promise<void>
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
}

export const ChatTranscript = memo(function ChatTranscript({
  scrollRef,
  liveTailRef,
  messages,
  runningTurn,
  selectedTurnId,
  highlightedUserTurnId,
  turnBranchNavigation,
  onSelectTurn,
  onForkThread,
  onSelectTurnBranch,
  onSubmitEditedTurn,
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
  const showPendingActivity = Boolean(runningTurn && !hasLiveOutput)
  const liveTailMessage = hasLiveOutput ? liveAssistant : undefined
  const virtualMessages = useMemo(
    () => streamingTurnId
      ? messages.filter((message) => !(message.role === "assistant" && message.turnId === streamingTurnId))
      : messages,
    [messages, streamingTurnId],
  )
  const rows = useMemo<Array<{ type: "message"; message: Message }>>(
    () => virtualMessages.map((message) => ({ type: "message" as const, message })),
    [virtualMessages],
  )
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => {
      const row = rows[index]
      return row?.type === "message" ? row.message.id : `activity:${streamingTurnId ?? "pending"}`
    },
    estimateSize: () => 160,
    overscan: 6,
  })

  return (
    <div
      ref={scrollRef}
      data-chat-transcript-scroller
      className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-8 pb-3"
    >
      <div className="mx-auto max-w-[760px]">
        {messages.length === 0 && !runningTurn && <EmptyState />}
        {rows.length > 0 && (
          <div
            className="relative"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full pb-7"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <MessageBubble
                    message={row.message}
                    selected={row.message.turnId === selectedTurnId}
                    streaming={false}
                    highlightedUser={row.message.role === "user" && row.message.turnId === highlightedUserTurnId}
                    branchNavigation={turnBranchNavigation[row.message.turnId]}
                    registerUserMessage={registerUserMessage}
                    onSelectTurn={onSelectTurn}
                    onForkThread={onForkThread}
                    onSelectTurnBranch={onSelectTurnBranch}
                    onSubmitEditedTurn={onSubmitEditedTurn}
                    rollingBackLedgerEntryId={rollingBackLedgerEntryId}
                    applyingProposalId={applyingProposalId}
                    onRollbackLedgerEntry={onRollbackLedgerEntry}
                    onApplyProposal={onApplyProposal}
                    onDiscardProposal={onDiscardProposal}
                  />
                </div>
              )
            })}
          </div>
        )}
        {(liveTailMessage || showPendingActivity) && (
          <div ref={liveTailRef} data-chat-live-tail className="pb-7">
            {liveTailMessage ? (
              <MessageBubble
                message={liveTailMessage}
                selected={liveTailMessage.turnId === selectedTurnId}
                streaming
                highlightedUser={false}
                branchNavigation={turnBranchNavigation[liveTailMessage.turnId]}
                registerUserMessage={registerUserMessage}
                onSelectTurn={onSelectTurn}
                onForkThread={onForkThread}
                onSelectTurnBranch={onSelectTurnBranch}
                onSubmitEditedTurn={onSubmitEditedTurn}
                rollingBackLedgerEntryId={rollingBackLedgerEntryId}
                applyingProposalId={applyingProposalId}
                onRollbackLedgerEntry={onRollbackLedgerEntry}
                onApplyProposal={onApplyProposal}
                onDiscardProposal={onDiscardProposal}
              />
            ) : (
              <ActivityIndicator events={[]} streaming />
            )}
          </div>
        )}
      </div>
    </div>
  )
})
