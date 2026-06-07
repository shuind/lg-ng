"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Message, SettingCard, Thread, Turn } from "@/lib/mock-data"
import type { ResponseConstraint } from "@/lib/types"
import { ChatComposer, type ChatComposerHandle } from "./composer"
import { ChatTranscript } from "./message-rendering"
import { ExportMenu, ThreadMenu } from "./thread-menu"
import type { ChatCitation, ChatSendOptions } from "./types"

interface ChatPanelProps {
  bookId: string
  bookTitle: string
  messages: Message[]
  turns: Turn[]
  threads: Thread[]
  activeThreadId: string
  selectedTurnId: string | null
  citations: ChatCitation[]
  settingCards: SettingCard[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  onSelectTurn: (turnId: string) => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
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
}

export function ChatPanel({
  bookId,
  bookTitle,
  messages,
  turns,
  threads,
  activeThreadId,
  selectedTurnId,
  citations,
  settingCards,
  responseConstraints,
  activeResponseConstraintIds,
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
}: ChatPanelProps) {
  const [highlightedUserTurnId, setHighlightedUserTurnId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<ChatComposerHandle>(null)
  const userMessageRefs = useRef(new Map<string, HTMLDivElement>())
  const highlightResetRef = useRef<number | null>(null)
  const questionJumpRef = useRef<{ sourceTurnId: string; offset: number } | null>(null)
  const runningTurn = useMemo(() => turns.find((turn) => turn.status === "running"), [turns])
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId),
    [threads, activeThreadId],
  )
  const latestUserTurnId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role === "user") return message.turnId
    }
    return null
  }, [messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, runningTurn?.id])

  useEffect(() => {
    return () => {
      if (highlightResetRef.current) window.clearTimeout(highlightResetRef.current)
    }
  }, [])

  useEffect(() => {
    questionJumpRef.current = null
  }, [activeThreadId, bookId])

  const handleEditLatest = useCallback((text: string) => {
    composerRef.current?.editLatest(text)
  }, [])

  const registerUserMessage = useCallback((turnId: string, element: HTMLDivElement | null) => {
    if (element) {
      userMessageRefs.current.set(turnId, element)
    } else {
      userMessageRefs.current.delete(turnId)
    }
  }, [])

  const scrollToUserTurn = useCallback((turnId: string) => {
    const target = userMessageRefs.current.get(turnId)
    if (!target) return

    target.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightedUserTurnId(turnId)
    if (highlightResetRef.current) window.clearTimeout(highlightResetRef.current)
    highlightResetRef.current = window.setTimeout(() => {
      setHighlightedUserTurnId((current) => (current === turnId ? null : current))
    }, 1400)
  }, [])

  const jumpToQuestionFromTurn = useCallback((sourceTurnId: string) => {
    const userTurnIds: string[] = []
    const seenTurnIds = new Set<string>()
    for (const message of messages) {
      if (message.role !== "user" || seenTurnIds.has(message.turnId)) continue
      seenTurnIds.add(message.turnId)
      userTurnIds.push(message.turnId)
    }

    const sourceIndex = userTurnIds.lastIndexOf(sourceTurnId)
    if (sourceIndex < 0) return

    const previousJump = questionJumpRef.current
    const nextOffset = previousJump?.sourceTurnId === sourceTurnId
      ? Math.min(previousJump.offset + 1, sourceIndex)
      : 0
    const targetTurnId = userTurnIds[sourceIndex - nextOffset]
    if (!targetTurnId) return

    questionJumpRef.current = { sourceTurnId, offset: nextOffset }
    scrollToUserTurn(targetTurnId)
  }, [messages, scrollToUserTurn])

  const handleQuestionJump = useCallback(() => {
    const sourceTurnId = selectedTurnId && messages.some((message) => message.turnId === selectedTurnId)
      ? selectedTurnId
      : latestUserTurnId
    if (!sourceTurnId) return

    jumpToQuestionFromTurn(sourceTurnId)
  }, [jumpToQuestionFromTurn, latestUserTurnId, messages, selectedTurnId])

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between px-8 pt-6 pb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">当前书籍</div>
          <h1 className="font-serif text-xl tracking-wide text-foreground">{bookTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            bookTitle={bookTitle}
            threadTitle={activeThread?.title ?? "任务线程"}
            messages={messages}
            selectedTurnId={selectedTurnId}
          />
          <ThreadMenu
            threads={threads}
            activeThread={activeThread}
            onCreateThread={onCreateThread}
            onSelectThread={onSelectThread}
            onRenameThread={onRenameThread}
            onSetThreadStatus={onSetThreadStatus}
          />
        </div>
      </header>

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
      />

      <ChatComposer
        ref={composerRef}
        bookId={bookId}
        activeThreadId={activeThreadId}
        activeThreadTitle={activeThread?.title ?? "任务线程"}
        citations={citations}
        settingCards={settingCards}
        responseConstraints={responseConstraints}
        activeResponseConstraintIds={activeResponseConstraintIds}
        latestUserTurnId={latestUserTurnId}
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
    </section>
  )
}
