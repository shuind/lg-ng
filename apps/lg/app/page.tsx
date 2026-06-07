"use client"

import { useEffect, useState } from "react"
import { LeftSidebar } from "@/components/lg/left-sidebar"
import { ChatPanel, type ChatCitation, type ChatSendOptions } from "@/components/lg/chat-panel"
import { RightSidebar } from "@/components/lg/right-sidebar"
import { WritingDesk } from "@/components/lg/writing-desk"
import { Workbench } from "@/components/lg/workbench"
import { useWorkbenchOverlay } from "@/hooks/use-workbench-overlay"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  listBooks,
  initBook,
  listChapters,
  listSettingCards,
  listLedgerEntries,
  sendMessage,
  createThread,
  forkThread,
  getThread,
  updateThread,
  createBook,
  createChapter,
  renameBook,
  createResponseConstraint,
  updateResponseConstraint,
  deleteResponseConstraint,
  setThreadResponseConstraints,
} from "@/lib/api"
import type { Book, Chapter, Message, SettingCard, Thread, Turn, OutlineFile } from "@/lib/mock-data"
import type { ThreadBundle } from "@/lib/api"
import type { LedgerEntry, ResponseConstraint } from "@/lib/types"

type Mode = "chat" | "writing"

export default function Page() {
  const [books, setBooks] = useState<Book[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [outlines, setOutlines] = useState<OutlineFile[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string>("")
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const [cards, setCards] = useState<SettingCard[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [activeBookId, setActiveBookId] = useState<string>("")
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("chat")
  const [collapsed, setCollapsed] = useState(false)
  const workbench = useWorkbenchOverlay(books)
  const [chatCitations, setChatCitations] = useState<ChatCitation[]>([])
  const [responseConstraints, setResponseConstraints] = useState<ResponseConstraint[]>([])
  const [threadConstraintIds, setThreadConstraintIds] = useState<Record<string, string[]>>({})

  useEffect(() => {
    listBooks().then((bs) => {
      setBooks(bs)
      setActiveBookId((prev) => {
        if (prev && bs.some((b) => b.id === prev)) return prev
        return bs[0]?.id ?? ""
      })
    })
  }, [])

  useEffect(() => {
    if (!activeBookId) return
    initBook(activeBookId).then(({
      chapters,
      outlines,
      messages,
      threads,
      activeThreadId,
      turns,
      cards,
      responseConstraints,
      threadConstraintIds,
    }) => {
      setChapters(chapters)
      setOutlines(outlines)
      setMessages(messages)
      setThreads(threads)
      setActiveThreadId(activeThreadId)
      setTurns(turns)
      setSelectedTurnId(findLatestSelectableTurnId(turns, messages))
      setCards(cards)
      setResponseConstraints(responseConstraints)
      setThreadConstraintIds(threadConstraintIds)
    })
    listLedgerEntries(activeBookId, { limit: 24 })
      .then((response) => setLedgerEntries(response.entries))
      .catch(() => setLedgerEntries([]))
  }, [activeBookId])

  async function handleSend(
    text: string,
    citations: ChatCitation[],
    options: ChatSendOptions,
  ) {
    if (!activeBookId) return
    const fallbackThreadId = activeThreadId || threads.find((thread) => thread.status === "active")?.id
    if (!fallbackThreadId) return
    await handleSendWithThread(text, fallbackThreadId, citations, options)
  }

  async function handleNewBook() {
    const title = window.prompt("请输入书名")
    if (!title?.trim()) return
    try {
      const b = await createBook(title.trim())
      const bs = await listBooks()
      setBooks(bs)
      setActiveBookId(b.id)
      setActiveChapterId(null)
      setMode("chat")
      workbench.close()
    } catch (err) {
      console.error("[handleNewBook] 创建书籍失败:", err)
      alert("创建书籍失败，请重试")
    }
  }

  async function handleCreateThread() {
    if (!activeBookId) return
    const bundle = await createThread(activeBookId)
    applyThreadBundle(bundle, true)
  }

  async function handleSelectThread(threadId: string) {
    if (!activeBookId || threadId === activeThreadId) return
    const bundle = await getThread(activeBookId, threadId)
    if (bundle) applyThreadBundle(bundle, true)
  }

  async function handleRenameThread(threadId: string, title: string) {
    if (!activeBookId) return
    const thread = await updateThread(activeBookId, threadId, { title })
    if (!thread) return
    setThreads((current) => upsertById(current, thread))
  }

  async function handleSetThreadStatus(threadId: string, status: Thread["status"]) {
    if (!activeBookId) return
    const thread = await updateThread(activeBookId, threadId, { status })
    if (!thread) return
    const activeCandidates = threads.filter((item) => item.id !== threadId && item.status === "active")
    setThreads((current) => {
      const next = status === "deleted"
        ? current.filter((item) => item.id !== threadId)
        : upsertById(current, thread)
      return next
    })

    if (threadId === activeThreadId && status !== "active") {
      const nextThread = activeCandidates[0]
      if (nextThread) {
        await handleSelectThread(nextThread.id)
      } else {
        const bundle = await createThread(activeBookId, "默认任务线程")
        applyThreadBundle(bundle, true)
      }
    }
  }

  async function handleForkThread(turnId: string) {
    if (!activeBookId || !activeThreadId) return
    const bundle = await forkThread(activeBookId, { threadId: activeThreadId, turnId })
    applyThreadBundle(bundle, true)
  }

  function applyThreadBundle(bundle: ThreadBundle, selectThread: boolean) {
    setThreads((current) => upsertById(current, bundle.thread))
    if (selectThread) setActiveThreadId(bundle.thread.id)
    setTurns(bundle.turns)
    setMessages(bundle.messages)
    setSelectedTurnId(findLatestSelectableTurnId(bundle.turns, bundle.messages))
  }

  async function handleRenameBook(bookId: string, newTitle: string) {
    const result = await renameBook(bookId, newTitle)
    if (result) {
      setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, title: result.title } : b)))
    }
  }

  async function handleNewChapter() {
    const c = await createChapter(activeBookId)
    // refresh full list from server to get accurate index/mtime
    const fresh = await listChapters(activeBookId)
    setChapters(fresh)
    setActiveChapterId(c.id)
    setMode("writing")
  }

  function handleCiteSettingCard(card: SettingCard) {
    setMode("chat")
    setActiveChapterId(null)
    setChatCitations((current) => {
      if (current.some((item) => item.id === card.id)) return current
      return [...current, card]
    })
  }

  function handleRemoveCitation(cardId: string) {
    setChatCitations((current) => current.filter((card) => card.id !== cardId))
  }

  function handleClearCitations() {
    setChatCitations([])
  }

  function applyResponseConstraintStore(store: {
    constraints: ResponseConstraint[]
    threadEnabled: Record<string, string[]>
  }) {
    setResponseConstraints(store.constraints)
    setThreadConstraintIds(store.threadEnabled)
  }

  async function handleCreateResponseConstraint(input: Pick<ResponseConstraint, "title" | "instruction">) {
    if (!activeBookId) return
    const store = await createResponseConstraint(activeBookId, input)
    applyResponseConstraintStore(store)
  }

  async function handleUpdateResponseConstraint(input: Pick<ResponseConstraint, "id" | "title" | "instruction">) {
    if (!activeBookId) return
    const store = await updateResponseConstraint(activeBookId, input)
    applyResponseConstraintStore(store)
  }

  async function handleDeleteResponseConstraint(constraintId: string) {
    if (!activeBookId) return
    const store = await deleteResponseConstraint(activeBookId, constraintId)
    applyResponseConstraintStore(store)
  }

  async function handleSetActiveResponseConstraintIds(enabledIds: string[]) {
    if (!activeBookId || !activeThreadId) return
    setThreadConstraintIds((current) => ({ ...current, [activeThreadId]: enabledIds }))
    const store = await setThreadResponseConstraints(activeBookId, activeThreadId, enabledIds)
    applyResponseConstraintStore(store)
  }

  function handleOpenWorkbench(bookId: string, path?: string) {
    workbench.open(bookId, path)
  }

  async function handleSendWithThread(
    text: string,
    threadId: string,
    citations: ChatCitation[] = [],
    options: Partial<ChatSendOptions> = {},
  ) {
    if (!activeBookId) return
    const targetThread = threads.find((thread) => thread.id === threadId)
    if (targetThread && targetThread.status !== "active") return

    const optimisticTurnId = `turn-local-${Date.now()}`
    const optimisticConstraints = buildAppliedConstraints(
      responseConstraints,
      options.constraintIds ?? threadConstraintIds[threadId] ?? [],
      options.temporaryConstraints ?? [],
    )
    const optimisticUser: Message = {
      id: `msg-local-${Date.now()}`,
      threadId,
      turnId: optimisticTurnId,
      role: "user",
      content: text,
      version: 1,
      createdAt: new Date().toISOString(),
      constraints: optimisticConstraints.length > 0 ? optimisticConstraints : undefined,
    }
    const optimisticTurn: Turn = {
      id: optimisticTurnId,
      threadId,
      userMessageId: optimisticUser.id,
      status: "running",
      createdAt: optimisticUser.createdAt,
      updatedAt: optimisticUser.createdAt,
    }

    setMessages((current) => [...current, optimisticUser])
    setTurns((current) => [...current, optimisticTurn])
    setSelectedTurnId(optimisticTurnId)

    try {
      const result = await sendMessage(activeBookId, text, threadId, citations, options)
      setThreads((current) => upsertById(current, result.thread))
      setActiveThreadId(result.thread.id)
      setTurns((current) => upsertById(current.filter((turn) => turn.id !== optimisticTurnId), result.turn))
      setMessages((current) => {
        const withoutOptimistic = current.filter((message) => message.id !== optimisticUser.id)
        return [
          ...withoutOptimistic,
          result.userMessage,
          ...(result.assistantMessage ? [result.assistantMessage] : []),
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      })
      listLedgerEntries(activeBookId, { limit: 24 })
        .then((response) => setLedgerEntries(response.entries))
        .catch(() => {})
      listSettingCards(activeBookId).then(setCards).catch(() => {})
      listChapters(activeBookId).then(setChapters).catch(() => {})
      setSelectedTurnId(result.turn.id)
    } catch (err) {
      console.error("[handleSend] 发送失败:", err)
      const ts = new Date().toISOString()
      const failedTurn: Turn = {
        ...optimisticTurn,
        status: "failed",
        error: err instanceof Error ? err.message : "发送失败",
        updatedAt: ts,
      }
      const assistantMessage: Message = {
        id: `msg-local-error-${Date.now()}`,
        threadId,
        turnId: optimisticTurnId,
        role: "assistant",
        content: "处理失败，请稍后重试。",
        version: 1,
        createdAt: ts,
        events: [
          {
            id: `event-local-error-${Date.now()}`,
            turnId: optimisticTurnId,
            type: "error",
            message: failedTurn.error,
            createdAt: ts,
          },
        ],
      }
      setTurns((current) => upsertById(current, failedTurn))
      setMessages((current) => [...current, assistantMessage])
    }
  }

  const activeBook = books.find((b) => b.id === activeBookId)
  const activeResponseConstraintIds = activeThreadId ? threadConstraintIds[activeThreadId] ?? [] : []

  const gridCols = collapsed ? "grid-cols-[64px_minmax(0,1fr)_360px]" : "grid-cols-[260px_minmax(0,1fr)_360px]"

  return (
    <main className="ambient-window relative h-screen w-screen overflow-hidden">
      {/* 全屏柔光层 — 静态，不做动画避免持续 GPU 重绘 */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[var(--light-warm)] opacity-60 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-[var(--light-cool)] opacity-40 blur-3xl dark:opacity-25" />
      </div>

      <div className={`relative z-10 grid h-full min-h-0 ${gridCols} transition-[grid-template-columns] duration-300`}>
        {/* 左 */}
        <div className="relative min-h-0 border-r border-border/60">
          {/* 外置折叠手柄 - 常驻在左栏右边缘 */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="group absolute -right-3 top-1/2 z-20 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-md bg-card/0 text-muted-foreground/40 transition hover:bg-card/80 hover:text-foreground hover:shadow-sm"
            aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
            title={collapsed ? "展开侧栏" : "折叠侧栏"}
          >
            <span className="absolute left-2 h-8 w-px bg-border/60 transition group-hover:bg-border" />
            {collapsed ? <ChevronRight className="relative h-3.5 w-3.5" /> : <ChevronLeft className="relative h-3.5 w-3.5" />}
          </button>
          <LeftSidebar
            books={books}
            chapters={chapters}
            outlines={outlines}
            activeBookId={activeBookId}
            activeChapterId={activeChapterId}
            mode={mode}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((c) => !c)}
            onSelectBook={(id) => {
              setActiveBookId(id)
              setMode("chat")
              setActiveChapterId(null)
            }}
            onSelectChapter={(id) => {
              setActiveChapterId(id)
              setMode("writing")
            }}
            onBackToChat={() => {
              setMode("chat")
              setActiveChapterId(null)
            }}
            onNewBook={handleNewBook}
            onNewChapter={handleNewChapter}
            onOpenWorkbench={handleOpenWorkbench}
            onRenameBook={handleRenameBook}
          />
        </div>

        {/* 中 */}
        <div className="relative min-h-0 min-w-0">
          {mode === "chat" ? (
            <ChatPanel
              bookId={activeBookId}
              bookTitle={activeBook?.title ?? ""}
              messages={messages}
              turns={turns}
              threads={threads}
              activeThreadId={activeThreadId}
              selectedTurnId={selectedTurnId}
              citations={chatCitations}
              settingCards={cards}
              responseConstraints={responseConstraints}
              activeResponseConstraintIds={activeResponseConstraintIds}
              onSelectTurn={setSelectedTurnId}
              onSend={handleSend}
              onAddCitation={handleCiteSettingCard}
              onRemoveCitation={handleRemoveCitation}
              onClearCitations={handleClearCitations}
              onCreateResponseConstraint={handleCreateResponseConstraint}
              onUpdateResponseConstraint={handleUpdateResponseConstraint}
              onDeleteResponseConstraint={handleDeleteResponseConstraint}
              onSetActiveResponseConstraintIds={handleSetActiveResponseConstraintIds}
              onCreateThread={handleCreateThread}
              onSelectThread={handleSelectThread}
              onRenameThread={handleRenameThread}
              onSetThreadStatus={handleSetThreadStatus}
              onForkThread={handleForkThread}
            />
          ) : activeChapterId ? (
            <WritingDesk bookId={activeBookId} chapterId={activeChapterId} />
          ) : null}
        </div>

        {/* 右 */}
        <div className="min-h-0 border-l border-border/60">
          <RightSidebar
            cards={cards}
            ledgerEntries={ledgerEntries}
            onCite={handleCiteSettingCard}
            onOpenFile={(path) => activeBookId && handleOpenWorkbench(activeBookId, path)}
          />
        </div>
      </div>

      {/* 工作台:覆盖整屏 */}
      {workbench.book && (
        <Workbench
          book={workbench.book}
          initialPath={workbench.initialPath}
          onClose={workbench.close}
        />
      )}
    </main>
  )
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [...items, item]
}

function findLatestSelectableTurnId(turns: Turn[], messages: Message[]): string | null {
  const latestDoneTurn = [...turns].reverse().find((turn) => turn.status === "done")
  if (latestDoneTurn) return latestDoneTurn.id
  return messages.at(-1)?.turnId ?? null
}

function buildAppliedConstraints(
  constraints: ResponseConstraint[],
  enabledIds: string[],
  temporaryConstraints: string[],
): NonNullable<Message["constraints"]> {
  const enabled = new Set(enabledIds)
  return [
    ...constraints
      .filter((constraint) => enabled.has(constraint.id))
      .map((constraint) => ({
        id: constraint.id,
        title: constraint.title,
        instruction: constraint.instruction,
        source: "library" as const,
      })),
    ...temporaryConstraints
      .map((instruction, index) => ({
        title: `本轮临时约束 ${index + 1}`,
        instruction: instruction.trim(),
        source: "temporary" as const,
      }))
      .filter((constraint) => constraint.instruction),
  ]
}
