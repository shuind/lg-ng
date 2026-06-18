"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChatReference, ImportedMaterial, Message, MessageContextWindow, SettingCard, Thread, Turn } from "@/lib/types"
import type { ResponseConstraint } from "@/lib/types"
import { ChatCommandPalette } from "./chat-command-palette"
import { ChatPanelHeader } from "./chat-panel-header"
import { ChatComposer, type ChatComposerHandle } from "./composer"
import { ChatTranscript } from "./message-rendering"
import type { ChatCitation, ChatSendOptions, TurnBranchNavigation } from "./types"
import { useChatTranscriptNavigation } from "./use-chat-transcript-navigation"

function estimateThreadContextWindow(messages: Message[]): MessageContextWindow {
  const sessionMessages = Math.max(1, Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / 2.4))
  const expectedOutputReserve = 4096
  const estimatedTokens = sessionMessages + expectedOutputReserve
  const budgetTokens = 128000
  const triggerTokens = 96000
  const triggerRatio = triggerTokens / budgetTokens
  const ratio = estimatedTokens / budgetTokens
  return {
    estimatedTokens,
    budgetTokens,
    ratio,
    triggerRatio,
    triggerTokens,
    level: contextLevelFromTokens(estimatedTokens, budgetTokens, triggerTokens),
    reserveTokens: expectedOutputReserve,
    components: {
      sessionMessages,
      projectContext: 0,
      currentPrompt: 0,
      expectedOutputReserve,
      total: estimatedTokens,
    },
  }
}

function contextLevelFromTokens(estimatedTokens: number, budgetTokens: number, triggerTokens: number): MessageContextWindow["level"] {
  const ratio = budgetTokens > 0 ? estimatedTokens / budgetTokens : 0
  if (ratio >= 1) return "blocking"
  if (estimatedTokens >= triggerTokens) return "auto_compact"
  if (ratio >= 0.65) return "should_compact"
  if (ratio >= 0.5) return "warning"
  return "normal"
}

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
  const contextWindow = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.contextWindow)?.contextWindow ?? estimateThreadContextWindow(messages),
    [messages],
  )
  const {
    scrollRef,
    contentRef,
    liveTailRef,
    registerScrollToBottom,
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
        bookId={bookId}
        bookTitle={bookTitle}
        activeThreadId={activeThreadId}
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
        contentRef={contentRef}
        liveTailRef={liveTailRef}
        registerScrollToBottom={registerScrollToBottom}
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
        citations={citations}
        settingCards={settingCards}
        importedMaterials={importedMaterials}
        responseConstraints={responseConstraints}
        activeResponseConstraintIds={activeResponseConstraintIds}
        contextWindow={contextWindow}
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
