"use client"

import { useCallback, useMemo, useRef } from "react"
import type { Message, SettingCard, Thread, Turn } from "@/lib/mock-data"
import type { ResponseConstraint } from "@/lib/types"
import { ChatPanelHeader } from "./chat-panel-header"
import { ChatComposer, type ChatComposerHandle } from "./composer"
import { ChatTranscript } from "./message-rendering"
import type { ChatCitation, ChatSendOptions } from "./types"
import { useChatTranscriptNavigation } from "./use-chat-transcript-navigation"

interface ChatPanelProps {
  bookId: string
  bookTitle: string
  messages: Message[]
  turns: Turn[]
  threads: Thread[]
  activeThreadId: string
  selectedTurnId: string | null
  reviewing: boolean
  citations: ChatCitation[]
  settingCards: SettingCard[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  onSelectTurn: (turnId: string) => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onReview: () => Promise<void>
  onAddCitation: (card: SettingCard) => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onSetActiveResponseConstraintIds: (constraintIds: string[]) => Promise<void>
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
  onForkThread: (turnId: string) => void
  onRollbackLedgerEntry: (entryId: string) => Promise<void>
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
}

export function ChatPanel({
  bookId,
  bookTitle,
  messages,
  turns,
  threads,
  activeThreadId,
  selectedTurnId,
  reviewing,
  citations,
  settingCards,
  responseConstraints,
  activeResponseConstraintIds,
  rollingBackLedgerEntryId,
  applyingProposalId,
  onSelectTurn,
  onSend,
  onReview,
  onAddCitation,
  onRemoveCitation,
  onClearCitations,
  onCreateResponseConstraint,
  onUpdateResponseConstraint,
  onDeleteResponseConstraint,
  onSetActiveResponseConstraintIds,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onSetThreadStatus,
  onForkThread,
  onRollbackLedgerEntry,
  onApplyProposal,
  onDiscardProposal,
}: ChatPanelProps) {
  const composerRef = useRef<ChatComposerHandle>(null)
  const runningTurn = useMemo(() => turns.find((turn) => turn.status === "running"), [turns])
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId),
    [threads, activeThreadId],
  )
  const {
    scrollRef,
    latestUserTurnId,
    highlightedUserTurnId,
    registerUserMessage,
    handleQuestionJump,
  } = useChatTranscriptNavigation({
    bookId,
    activeThreadId,
    messages,
    selectedTurnId,
    runningTurnId: runningTurn?.id,
  })

  const handleEditLatest = useCallback((text: string) => {
    composerRef.current?.editLatest(text)
  }, [])

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      <ChatPanelHeader
        bookTitle={bookTitle}
        activeThread={activeThread}
        messages={messages}
        selectedTurnId={selectedTurnId}
        threads={threads}
        onCreateThread={onCreateThread}
        onSelectThread={onSelectThread}
        onRenameThread={onRenameThread}
        onSetThreadStatus={onSetThreadStatus}
      />

      <ChatTranscript
        scrollRef={scrollRef}
        messages={messages}
        runningTurn={runningTurn}
        selectedTurnId={selectedTurnId}
        latestUserTurnId={latestUserTurnId}
        highlightedUserTurnId={highlightedUserTurnId}
        onSelectTurn={onSelectTurn}
        onForkThread={onForkThread}
        onEditLatest={handleEditLatest}
        registerUserMessage={registerUserMessage}
        rollingBackLedgerEntryId={rollingBackLedgerEntryId}
        applyingProposalId={applyingProposalId}
        onRollbackLedgerEntry={onRollbackLedgerEntry}
        onApplyProposal={onApplyProposal}
        onDiscardProposal={onDiscardProposal}
      />

      <ChatComposer
        ref={composerRef}
        bookId={bookId}
        activeThreadId={activeThreadId}
        activeThreadTitle={activeThread?.title ?? "任务线程"}
        reviewing={reviewing}
        citations={citations}
        settingCards={settingCards}
        responseConstraints={responseConstraints}
        activeResponseConstraintIds={activeResponseConstraintIds}
        latestUserTurnId={latestUserTurnId}
        onQuestionJump={handleQuestionJump}
        onSend={onSend}
        onReview={onReview}
        onAddCitation={onAddCitation}
        onRemoveCitation={onRemoveCitation}
        onClearCitations={onClearCitations}
        onCreateResponseConstraint={onCreateResponseConstraint}
        onUpdateResponseConstraint={onUpdateResponseConstraint}
        onDeleteResponseConstraint={onDeleteResponseConstraint}
        onSetActiveResponseConstraintIds={onSetActiveResponseConstraintIds}
      />
    </section>
  )
}
