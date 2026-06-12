"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChatReference, ImportedMaterial, Message, SettingCard, Thread, Turn } from "@/lib/types"
import type { ResponseConstraint } from "@/lib/types"
import { ChatCommandPalette } from "./chat-command-palette"
import { ChatPanelHeader } from "./chat-panel-header"
import { ChatComposer, type ChatComposerHandle } from "./composer"
import { ChatTranscript } from "./message-rendering"
import type { ChatCitation, ChatSendOptions, TurnBranchNavigation } from "./types"
import { useChatTranscriptNavigation } from "./use-chat-transcript-navigation"

interface ChatPanelProps {
  bookId: string
  bookTitle: string
  messages: Message[]
  turns: Turn[]
  threads: Thread[]
  activeThreadId: string
  selectedTurnId: string | null
  turnBranchNavigation: Record<string, TurnBranchNavigation>
  citations: ChatCitation[]
  settingCards: SettingCard[]
  importedMaterials: ImportedMaterial[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  onSelectTurn: (turnId: string) => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onAddCitation: (reference: ChatReference) => void
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
  onSelectTurnBranch: (turnId: string) => void
  onSubmitEditedTurn: (turnId: string, content: string) => Promise<void>
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
  turnBranchNavigation,
  citations,
  settingCards,
  importedMaterials,
  responseConstraints,
  activeResponseConstraintIds,
  rollingBackLedgerEntryId,
  applyingProposalId,
  onSelectTurn,
  onSend,
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
  onSelectTurnBranch,
  onSubmitEditedTurn,
  onRollbackLedgerEntry,
  onApplyProposal,
  onDiscardProposal,
}: ChatPanelProps) {
  const composerRef = useRef<ChatComposerHandle>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const runningTurn = useMemo(() => turns.find((turn) => turn.status === "running"), [turns])
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId),
    [threads, activeThreadId],
  )
  const {
    scrollRef,
    liveTailRef,
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

  const handleFocusComposer = useCallback(() => {
    composerRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return
      event.preventDefault()
      setCommandOpen(true)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
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
        liveTailRef={liveTailRef}
        messages={messages}
        runningTurn={runningTurn}
        selectedTurnId={selectedTurnId}
        highlightedUserTurnId={highlightedUserTurnId}
        turnBranchNavigation={turnBranchNavigation}
        onSelectTurn={onSelectTurn}
        onForkThread={onForkThread}
        onSelectTurnBranch={onSelectTurnBranch}
        onSubmitEditedTurn={onSubmitEditedTurn}
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
        citations={citations}
        settingCards={settingCards}
        importedMaterials={importedMaterials}
        responseConstraints={responseConstraints}
        activeResponseConstraintIds={activeResponseConstraintIds}
        latestUserTurnId={latestUserTurnId}
        sendBlocked={Boolean(runningTurn)}
        onQuestionJump={handleQuestionJump}
        onSend={onSend}
        onAddCitation={onAddCitation}
        onRemoveCitation={onRemoveCitation}
        onClearCitations={onClearCitations}
        onCreateResponseConstraint={onCreateResponseConstraint}
        onUpdateResponseConstraint={onUpdateResponseConstraint}
        onDeleteResponseConstraint={onDeleteResponseConstraint}
        onSetActiveResponseConstraintIds={onSetActiveResponseConstraintIds}
      />

      <ChatCommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        activeThreadId={activeThreadId}
        threads={threads}
        onCreateThread={onCreateThread}
        onSelectThread={onSelectThread}
        onFocusComposer={handleFocusComposer}
      />
    </section>
  )
}
