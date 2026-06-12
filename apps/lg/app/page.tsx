"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppShell, type AppMode } from "@/components/lg/app-shell"
import type { ChatCitation, ChatSendOptions } from "@/components/lg/chat-panel/types"
import type { WorkbenchOpenOptions } from "@/components/lg/workbench/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useBookSnapshotCache, type BookSnapshot } from "@/hooks/use-book-snapshot-cache"
import { useStableCallback } from "@/hooks/use-stable-callback"
import { useWorkbenchOverlay } from "@/hooks/use-workbench-overlay"
import { toast } from "@/hooks/use-toast"
import { importedMaterialToReference, settingCardToReference } from "@/lib/chat-references"
import {
  listBooks,
  listChapters,
  listSettingCards,
  listImportedMaterials,
  importMaterials,
  listLedgerEntries,
  rollbackLedgerEntry,
  applyProposal,
  discardProposal,
  sendMessageStream,
  runBookReview,
  createThread,
  forkThread,
  getThread,
  updateThread,
  createBook,
  createChapter,
  deleteChapter,
  renameBook,
  createResponseConstraint,
  updateResponseConstraint,
  deleteResponseConstraint,
  setThreadResponseConstraints,
} from "@/lib/api"
import type { Book, Chapter, ChatReference, ImportedMaterial, Message, SettingCard, Thread, Turn, OutlineFile } from "@/lib/types"
import type { ThreadBundle } from "@/lib/api"
import type { AgentEvent, LedgerEntry, ProposalSummary, ResponseConstraint } from "@/lib/types"
import {
  buildAppliedConstraints,
  buildChatThreadView,
  findLatestDescendantTurnId,
  findLatestSelectableTurnId,
  findTurnParentForEdit,
  upsertById,
  upsertTurnById,
} from "./page-utils"

function getErrorMessage(err: unknown, fallback = "请稍后重试。"): string {
  return err instanceof Error && err.message ? err.message : fallback
}

const AUTO_CHAT_BOOK_TITLE = "默认对话"
const AUTO_CHAT_THREAD_TITLE = "默认任务线程"

export default function Page() {
  const [books, setBooks] = useState<Book[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [outlines, setOutlines] = useState<OutlineFile[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string>("")
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const [activeLeafTurnId, setActiveLeafTurnId] = useState<string | null>(null)
  const [cards, setCards] = useState<SettingCard[]>([])
  const [importedMaterials, setImportedMaterials] = useState<ImportedMaterial[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [rollingBackLedgerEntryId, setRollingBackLedgerEntryId] = useState<string | null>(null)
  const [applyingProposalId, setApplyingProposalId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [activeBookId, setActiveBookId] = useState<string>("")
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [mode, setMode] = useState<AppMode>("chat")
  const [collapsed, setCollapsed] = useState(false)
  const workbench = useWorkbenchOverlay(books)
  const [chatCitations, setChatCitations] = useState<ChatCitation[]>([])
  const [responseConstraints, setResponseConstraints] = useState<ResponseConstraint[]>([])
  const [threadConstraintIds, setThreadConstraintIds] = useState<Record<string, string[]>>({})
  const [newBookDialogOpen, setNewBookDialogOpen] = useState(false)
  const [newBookTitle, setNewBookTitle] = useState("")
  const [creatingBook, setCreatingBook] = useState(false)
  const skipNextBookInitLoadRef = useRef<string | null>(null)
  const {
    getSnapshot,
    hasSnapshot,
    loadSnapshot,
    updateSnapshot,
  } = useBookSnapshotCache()
  const chatThreadView = useMemo(
    () => buildChatThreadView(turns, messages, activeLeafTurnId),
    [activeLeafTurnId, messages, turns],
  )
  const visibleRunningTurnId = chatThreadView.visibleTurns.find((turn) => turn.status === "running")?.id ?? null

  function applyBookSnapshot(snapshot: BookSnapshot) {
    setChapters(snapshot.chapters)
    setOutlines(snapshot.outlines)
    setMessages(snapshot.messages)
    setThreads(snapshot.threads)
    setActiveThreadId(snapshot.activeThreadId)
    setTurns(snapshot.turns)
    const latestTurnId = findLatestSelectableTurnId(snapshot.turns, snapshot.messages)
    setSelectedTurnId(latestTurnId)
    setActiveLeafTurnId(latestTurnId)
    setCards(snapshot.cards)
    setImportedMaterials(snapshot.importedMaterials)
    setResponseConstraints(snapshot.responseConstraints)
    setThreadConstraintIds(snapshot.threadConstraintIds)
    setLedgerEntries(snapshot.ledgerEntries)
  }

  function clearBookSnapshot() {
    setChapters([])
    setOutlines([])
    setMessages([])
    setThreads([])
    setTurns([])
    setCards([])
    setImportedMaterials([])
    setLedgerEntries([])
    setActiveThreadId("")
    setSelectedTurnId(null)
    setActiveLeafTurnId(null)
    setResponseConstraints([])
    setThreadConstraintIds({})
  }

  useEffect(() => {
    let cancelled = false
    listBooks()
      .then((bs) => {
        if (cancelled) return
        setBooks(bs)
        setActiveBookId((prev) => {
          if (prev && bs.some((b) => b.id === prev)) return prev
          return bs[0]?.id ?? ""
        })
      })
      .catch((err) => {
        if (cancelled) return
        toast({
          variant: "destructive",
          title: "读取书籍失败",
          description: getErrorMessage(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeBookId) return
    if (skipNextBookInitLoadRef.current === activeBookId) {
      skipNextBookInitLoadRef.current = null
      return
    }
    let cancelled = false
    const cached = getSnapshot(activeBookId)
    if (cached) {
      applyBookSnapshot(cached)
    } else {
      clearBookSnapshot()
    }

    loadSnapshot(activeBookId)
      .then((snapshot) => {
        if (cancelled) return
        applyBookSnapshot(snapshot)
      })
      .catch((err) => {
        if (cancelled) return
        if (!cached) clearBookSnapshot()
        toast({
          variant: "destructive",
          title: cached ? "刷新书籍失败" : "初始化书籍失败",
          description: getErrorMessage(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [activeBookId])

  async function ensureBookContext(): Promise<string> {
    if (activeBookId) return activeBookId

    const book = await createBook(AUTO_CHAT_BOOK_TITLE)
    setBooks((current) => upsertById(current, book))
    skipNextBookInitLoadRef.current = book.id
    setActiveBookId(book.id)
    setActiveChapterId(null)
    setMode("chat")
    workbench.close()
    return book.id
  }

  async function ensureChatContext(): Promise<{ bookId: string; threadId: string }> {
    const bookId = await ensureBookContext()
    const existingThreadId = bookId === activeBookId
      ? activeThreadId || threads.find((thread) => thread.status === "active")?.id
      : undefined

    if (existingThreadId) return { bookId, threadId: existingThreadId }

    const bundle = await createThread(bookId, AUTO_CHAT_THREAD_TITLE)
    applyThreadBundle(bundle, true, bookId)
    return { bookId, threadId: bundle.thread.id }
  }

  async function handleSend(
    text: string,
    citations: ChatCitation[],
    options: ChatSendOptions,
  ) {
    let context: { bookId: string; threadId: string }
    try {
      context = await ensureChatContext()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "初始化对话失败",
        description: getErrorMessage(err),
      })
      return
    }

    await handleSendWithThread(text, context.threadId, citations, {
      ...options,
      parentTurnId: options.parentTurnId === undefined
        ? (context.threadId === activeThreadId ? chatThreadView.activeLeafTurnId ?? null : null)
        : options.parentTurnId,
    }, context.bookId)
  }

  function handleNewBook() {
    setNewBookTitle("")
    setNewBookDialogOpen(true)
  }

  async function handleCreateBookFromDialog() {
    const title = newBookTitle.trim()
    if (!title || creatingBook) return
    setCreatingBook(true)
    try {
      const b = await createBook(title)
      const bs = await listBooks()
      setBooks(bs)
      setActiveBookId(b.id)
      setActiveChapterId(null)
      setMode("chat")
      workbench.close()
      setNewBookDialogOpen(false)
    } catch (err) {
      console.error("[handleNewBook] 创建书籍失败:", err)
      toast({
        variant: "destructive",
        title: "创建书籍失败",
        description: getErrorMessage(err),
      })
    } finally {
      setCreatingBook(false)
    }
  }

  async function handleCreateThread() {
    try {
      const bookId = await ensureBookContext()
      const bundle = await createThread(bookId)
      applyThreadBundle(bundle, true, bookId)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "创建线程失败",
        description: getErrorMessage(err),
      })
    }
  }

  async function handleSelectThread(threadId: string) {
    if (!activeBookId || threadId === activeThreadId) return
    try {
      const bundle = await getThread(activeBookId, threadId)
      if (bundle) applyThreadBundle(bundle, true)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "切换线程失败",
        description: getErrorMessage(err),
      })
    }
  }

  async function handleRenameThread(threadId: string, title: string) {
    if (!activeBookId) return
    try {
      const thread = await updateThread(activeBookId, threadId, { title })
      if (!thread) return
      setThreads((current) => upsertById(current, thread))
    } catch (err) {
      toast({
        variant: "destructive",
        title: "重命名线程失败",
        description: getErrorMessage(err),
      })
    }
  }

  async function handleSetThreadStatus(threadId: string, status: Thread["status"]) {
    if (!activeBookId) return
    try {
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
    } catch (err) {
      toast({
        variant: "destructive",
        title: "更新线程失败",
        description: getErrorMessage(err),
      })
    }
  }

  async function handleForkThread(turnId: string) {
    if (!activeBookId || !activeThreadId) return
    try {
      const bundle = await forkThread(activeBookId, { threadId: activeThreadId, turnId })
      applyThreadBundle(bundle, true)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "分叉线程失败",
        description: getErrorMessage(err),
      })
    }
  }

  function handleSelectTurnBranch(turnId: string) {
    const leafTurnId = findLatestDescendantTurnId(turns, turnId) ?? turnId
    setActiveLeafTurnId(leafTurnId)
    setSelectedTurnId(turnId)
  }

  async function handleSubmitEditedTurn(turnId: string, content: string) {
    if (!activeBookId) return
    const parentTurnId = findTurnParentForEdit(turns, turnId)
    if (parentTurnId === undefined) return

    const originalMessage = messages.find((message) => message.role === "user" && message.turnId === turnId)
    const targetThreadId = originalMessage?.threadId ?? activeThreadId
    if (!targetThreadId) return

    const originalConstraints = originalMessage?.constraints ?? []
    const constraintIds = originalConstraints
      .filter((constraint) => constraint.source === "library" && constraint.id)
      .map((constraint) => constraint.id!)
    const temporaryConstraints = originalConstraints
      .filter((constraint) => constraint.source === "temporary")
      .map((constraint) => constraint.instruction)
    const skillIds = (originalMessage?.references ?? [])
      .filter((reference) => reference.type === "skill")
      .map((reference) => reference.name)
    const originalReferences = originalMessage?.references ?? []
    const restoredSettingReferences = cards
      .filter((card) =>
        originalReferences.some((reference) =>
          reference.path === card.path ||
          reference.path === card.id ||
          reference.name === card.name
        )
      )
      .map(settingCardToReference)
    const restoredMaterialReferences = importedMaterials
      .filter((material) =>
        originalReferences.some((reference) =>
          reference.type === "material" &&
          (reference.path === material.path || reference.name === material.name)
        )
      )
      .map(importedMaterialToReference)
    const restoredCitations = [...restoredSettingReferences, ...restoredMaterialReferences]

    await handleSendWithThread(content, targetThreadId, restoredCitations, {
      constraintIds,
      temporaryConstraints,
      skillIds,
      parentTurnId,
    })
  }

  function applyThreadBundle(bundle: ThreadBundle, selectThread: boolean, bookId = activeBookId) {
    setThreads((current) => upsertById(current, bundle.thread))
    if (selectThread) setActiveThreadId(bundle.thread.id)
    setTurns(bundle.turns)
    setMessages(bundle.messages)
    const latestTurnId = findLatestSelectableTurnId(bundle.turns, bundle.messages)
    setSelectedTurnId(latestTurnId)
    setActiveLeafTurnId(latestTurnId)
    if (bookId) {
      const cached = getSnapshot(bookId)
      updateSnapshot(bookId, {
        threads: cached ? upsertById(cached.threads, bundle.thread) : [bundle.thread],
        activeThreadId: selectThread ? bundle.thread.id : cached?.activeThreadId ?? activeThreadId,
        turns: bundle.turns,
        messages: bundle.messages,
      })
    }
  }

  useEffect(() => {
    if (!activeBookId || !activeThreadId || !visibleRunningTurnId) return
    let cancelled = false
    let timer: number | undefined

    async function pollRunningThread() {
      try {
        const bundle = await getThread(activeBookId, activeThreadId)
        if (!cancelled && bundle) applyThreadBundle(bundle, false)
      } catch {
        // Keep polling quietly; transient refresh failures should not strand a running turn.
      } finally {
        if (!cancelled) timer = window.setTimeout(pollRunningThread, 1500)
      }
    }

    timer = window.setTimeout(pollRunningThread, 1000)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [activeBookId, activeThreadId, visibleRunningTurnId])

  async function refreshThreadBundle(threadId: string, selectThread: boolean, bookId = activeBookId) {
    if (!bookId) return null
    const bundle = await getThread(bookId, threadId)
    if (!bundle) return null
    applyThreadBundle(bundle, selectThread, bookId)
    return bundle
  }

  async function handleRenameBook(bookId: string, newTitle: string) {
    try {
      const result = await renameBook(bookId, newTitle)
      setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, title: result.title } : b)))
    } catch (err) {
      toast({
        variant: "destructive",
        title: "重命名书籍失败",
        description: getErrorMessage(err),
      })
    }
  }

  async function handleNewChapter() {
    try {
      const c = await createChapter(activeBookId)
      const fresh = await listChapters(activeBookId)
      setChapters(fresh)
      updateSnapshot(activeBookId, { chapters: fresh })
      setActiveChapterId(c.id)
      setMode("writing")
    } catch (err) {
      toast({
        variant: "destructive",
        title: "新建章节失败",
        description: getErrorMessage(err),
      })
    }
  }

  async function handleDeleteChapter(chapterId: string) {
    if (!activeBookId) return

    try {
      await deleteChapter(activeBookId, chapterId)
      const fresh = await listChapters(activeBookId)
      setChapters(fresh)
      updateSnapshot(activeBookId, { chapters: fresh })

      if (activeChapterId === chapterId) {
        const nextChapterId = fresh[0]?.id ?? null
        setActiveChapterId(nextChapterId)
        setMode(nextChapterId ? "writing" : "chat")
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "鍒犻櫎绔犺妭澶辫触",
        description: getErrorMessage(err),
      })
    }
  }

  function handleAddCitation(reference: ChatReference) {
    setMode("chat")
    setActiveChapterId(null)
    setChatCitations((current) => {
      if (current.some((item) => item.id === reference.id)) return current
      return [...current, reference]
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
    try {
      const store = await createResponseConstraint(activeBookId, input)
      applyResponseConstraintStore(store)
    } catch (err) {
      toast({ variant: "destructive", title: "创建约束失败", description: getErrorMessage(err) })
    }
  }

  async function handleUpdateResponseConstraint(input: Pick<ResponseConstraint, "id" | "title" | "instruction">) {
    if (!activeBookId) return
    try {
      const store = await updateResponseConstraint(activeBookId, input)
      applyResponseConstraintStore(store)
    } catch (err) {
      toast({ variant: "destructive", title: "更新约束失败", description: getErrorMessage(err) })
    }
  }

  async function handleDeleteResponseConstraint(constraintId: string) {
    if (!activeBookId) return
    try {
      const store = await deleteResponseConstraint(activeBookId, constraintId)
      applyResponseConstraintStore(store)
    } catch (err) {
      toast({ variant: "destructive", title: "删除约束失败", description: getErrorMessage(err) })
    }
  }

  async function handleSetActiveResponseConstraintIds(enabledIds: string[]) {
    if (!activeBookId || !activeThreadId) return
    setThreadConstraintIds((current) => ({ ...current, [activeThreadId]: enabledIds }))
    try {
      const store = await setThreadResponseConstraints(activeBookId, activeThreadId, enabledIds)
      applyResponseConstraintStore(store)
    } catch (err) {
      toast({ variant: "destructive", title: "同步约束失败", description: getErrorMessage(err) })
    }
  }

  const handleOpenWorkbench = useCallback((bookId: string, options?: string | WorkbenchOpenOptions) => {
    workbench.open(bookId, options)
  }, [workbench.open])

  function upsertProposal(current: ProposalSummary, next: ProposalSummary): ProposalSummary {
    return current.id === next.id ? { ...current, ...next } : current
  }

  async function handleRollbackLedgerEntry(entryId: string) {
    if (!activeBookId || rollingBackLedgerEntryId) return
    setRollingBackLedgerEntryId(entryId)
    try {
      await rollbackLedgerEntry(activeBookId, entryId)
      const [ledgerResponse, freshCards, freshChapters, freshMaterials] = await Promise.all([
        listLedgerEntries(activeBookId, { limit: 24 }).catch(() => ({ entries: [] })),
        listSettingCards(activeBookId).catch(() => cards),
        listChapters(activeBookId).catch(() => chapters),
        listImportedMaterials(activeBookId).catch(() => importedMaterials),
      ])
      setLedgerEntries(ledgerResponse.entries)
      setCards(freshCards)
      setChapters(freshChapters)
      setImportedMaterials(freshMaterials)
      updateSnapshot(activeBookId, {
        ledgerEntries: ledgerResponse.entries,
        cards: freshCards,
        chapters: freshChapters,
        importedMaterials: freshMaterials,
      })
    } catch (err) {
      console.error("[handleRollbackLedgerEntry] 恢复失败:", err)
      toast({
        variant: "destructive",
        title: "恢复失败",
        description: err instanceof Error ? err.message : "请稍后重试。",
      })
    } finally {
      setRollingBackLedgerEntryId(null)
    }
  }

  async function refreshBookDerivedData(bookId = activeBookId) {
    if (!bookId) return
    const [ledgerResponse, freshCards, freshChapters, freshMaterials] = await Promise.all([
      listLedgerEntries(bookId, { limit: 24 }).catch(() => ({ entries: [] })),
      listSettingCards(bookId).catch(() => cards),
      listChapters(bookId).catch(() => chapters),
      listImportedMaterials(bookId).catch(() => importedMaterials),
    ])
    setLedgerEntries(ledgerResponse.entries)
    setCards(freshCards)
    setChapters(freshChapters)
    setImportedMaterials(freshMaterials)
    updateSnapshot(bookId, {
      ledgerEntries: ledgerResponse.entries,
      cards: freshCards,
      chapters: freshChapters,
      importedMaterials: freshMaterials,
    })
  }

  async function handleImportMaterials(files: File[]) {
    if (!activeBookId) {
      return {
        imported: [],
        rejected: files.map((file) => ({ name: file.name || "未命名文件", reason: "请先选择书籍" })),
      }
    }

    const result = await importMaterials(activeBookId, files)
    if (result.imported.length > 0) {
      setImportedMaterials((current) => {
        const byPath = new Map(current.map((item) => [item.path, item]))
        for (const material of result.imported) byPath.set(material.path, material)
        return [...byPath.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      })
      await refreshBookDerivedData()
    }
    return result
  }

  function updateProposalInMessages(proposalId: string, patch: Parameters<typeof upsertProposal>[1]) {
    setMessages((current) => current.map((message) => {
      if (!message.proposalSet?.proposals.some((proposal) => proposal.id === proposalId)) return message
      return {
        ...message,
        proposalSet: {
          proposals: message.proposalSet.proposals.map((proposal) =>
            proposal.id === proposalId ? upsertProposal(proposal, patch) : proposal,
          ),
        },
      }
    }))
  }

  async function handleApplyProposal(proposalId: string, hunkIds?: string[]): Promise<string | undefined> {
    if (!activeBookId || applyingProposalId) return undefined
    setApplyingProposalId(proposalId)
    try {
      const result = await applyProposal(activeBookId, proposalId, hunkIds)
      updateProposalInMessages(proposalId, result.proposal)
      await refreshBookDerivedData()
      return result.updatedContent
    } catch (err) {
      console.error("[handleApplyProposal] 采纳失败:", err)
      toast({
        variant: "destructive",
        title: "采纳失败",
        description: err instanceof Error ? err.message : "请稍后重试。",
      })
      return undefined
    } finally {
      setApplyingProposalId(null)
    }
  }

  async function handleDiscardProposal(proposalId: string) {
    if (!activeBookId || applyingProposalId) return
    setApplyingProposalId(proposalId)
    try {
      const proposal = await discardProposal(activeBookId, proposalId)
      updateProposalInMessages(proposalId, proposal)
    } catch (err) {
      console.error("[handleDiscardProposal] 丢弃失败:", err)
      toast({
        variant: "destructive",
        title: "丢弃失败",
        description: err instanceof Error ? err.message : "请稍后重试。",
      })
    } finally {
      setApplyingProposalId(null)
    }
  }

  async function handleReview() {
    if (!activeBookId || !activeThreadId || reviewing) return
    if (turns.some((turn) => turn.threadId === activeThreadId && turn.status === "running")) {
      toast({
        title: "上一轮还在运行",
        description: "等当前回复完成后再发起新的任务。",
      })
      return
    }
    const targetThread = threads.find((thread) => thread.id === activeThreadId)
    if (targetThread && targetThread.status !== "active") return

    const optimisticTurnId = `turn-local-review-${Date.now()}`
    const ts = new Date().toISOString()
    const optimisticUser: Message = {
      id: `msg-local-review-${Date.now()}`,
      threadId: activeThreadId,
      turnId: optimisticTurnId,
      role: "user",
      content: "体检：增量连续性 / 设定冲突 / 节奏 / 文风（dirty-index）",
      version: 1,
      createdAt: ts,
    }
    const optimisticTurn: Turn = {
      id: optimisticTurnId,
      threadId: activeThreadId,
      userMessageId: optimisticUser.id,
      status: "running",
      createdAt: ts,
      updatedAt: ts,
    }

    setReviewing(true)
    setMessages((current) => [...current, optimisticUser])
    setTurns((current) => [...current, optimisticTurn])
    setSelectedTurnId(optimisticTurnId)
    setActiveLeafTurnId(optimisticTurnId)

    try {
      const result = await runBookReview(activeBookId, activeThreadId, { kind: "continuity" })
      setThreads((current) => upsertById(current, result.thread))
      setTurns((current) => upsertTurnById(current.filter((turn) => turn.id !== optimisticTurnId), result.turn))
      setMessages((current) => {
        const withoutOptimistic = current.filter((message) => message.id !== optimisticUser.id)
        return [
          ...withoutOptimistic,
          result.userMessage,
          ...(result.assistantMessage ? [result.assistantMessage] : []),
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      })
      setSelectedTurnId(result.turn.id)
      setActiveLeafTurnId(result.turn.id)
    } catch (err) {
      console.error("[handleReview] 体检失败:", err)
      const failedAt = new Date().toISOString()
      const failedTurn: Turn = {
        ...optimisticTurn,
        status: "failed",
        error: err instanceof Error ? err.message : "体检失败",
        updatedAt: failedAt,
      }
      const assistantMessage: Message = {
        id: `msg-local-review-error-${Date.now()}`,
        threadId: activeThreadId,
        turnId: optimisticTurnId,
        role: "assistant",
        content: "体检失败，请稍后重试。",
        version: 1,
        createdAt: failedAt,
        events: [
          {
            id: `event-local-review-error-${Date.now()}`,
            turnId: optimisticTurnId,
            type: "error",
            message: failedTurn.error,
            createdAt: failedAt,
          },
        ],
      }
      setTurns((current) => upsertTurnById(current, failedTurn))
      setMessages((current) => [...current, assistantMessage])
    } finally {
      setReviewing(false)
    }
  }

  async function handleSendWithThread(
    text: string,
    threadId: string,
    citations: ChatCitation[] = [],
    options: Partial<ChatSendOptions> = {},
    bookId = activeBookId,
  ) {
    if (!bookId) return
    const targetThread = bookId === activeBookId
      ? threads.find((thread) => thread.id === threadId)
      : undefined
    if (targetThread && targetThread.status !== "active") return
    if (bookId === activeBookId && turns.some((turn) => turn.threadId === threadId && turn.status === "running")) {
      toast({
        title: "上一轮还在运行",
        description: "等当前回复完成后再发送下一条。",
      })
      return
    }

    const requestParentTurnId = options.parentTurnId === undefined
      ? (bookId === activeBookId ? chatThreadView.activeLeafTurnId ?? null : null)
      : options.parentTurnId
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
      parentTurnId: requestParentTurnId ?? undefined,
      userMessageId: optimisticUser.id,
      agentSessionId: optimisticTurnId,
      status: "running",
      createdAt: optimisticUser.createdAt,
      updatedAt: optimisticUser.createdAt,
    }

    setMessages((current) => [...current, optimisticUser])
    setTurns((current) => [...current, optimisticTurn])
    setSelectedTurnId(optimisticTurnId)
    setActiveLeafTurnId(optimisticTurnId)

    let latestTurn = optimisticTurn
    let serverTurnId = optimisticTurnId
    let hasServerTurn = false
    let assistantPlaceholderId = `msg-local-running-${optimisticTurnId}`
    let assistantFlushFrame: number | null = null
    let pendingAssistantMessageId: string | null = null
    let pendingAssistantContent: string | null = null
    const pendingReasoningEvents = new Map<string, AgentEvent>()
    const ensuredAssistantPlaceholders = new Set<string>()
    const reasoningSegments = new Map<number, { eventId: string; text: string }>()
    const ensureAssistantPlaceholder = (turnId: string, targetThreadId: string, messageId?: string) => {
      assistantPlaceholderId = messageId ?? `msg-local-running-${turnId}`
      if (ensuredAssistantPlaceholders.has(assistantPlaceholderId)) return
      ensuredAssistantPlaceholders.add(assistantPlaceholderId)
      setMessages((current) => {
        if (current.some((message) => message.id === assistantPlaceholderId)) return current
        return [...current, {
          id: assistantPlaceholderId,
          threadId: targetThreadId,
          turnId,
          role: "assistant" as const,
          content: "",
          version: 1,
          createdAt: new Date().toISOString(),
          events: [],
        }]
      })
    }
    const flushAssistantBuffer = () => {
      assistantFlushFrame = null
      const targetMessageId = pendingAssistantMessageId ?? assistantPlaceholderId
      const content = pendingAssistantContent
      const reasoningEvents = [...pendingReasoningEvents.values()]
      pendingAssistantMessageId = null
      pendingAssistantContent = null
      pendingReasoningEvents.clear()
      if (content === null && reasoningEvents.length === 0) return

      setMessages((current) => current.map((message) => {
        if (message.id !== targetMessageId) return message
        const updates: Partial<Message> = {}
        if (content !== null) updates.content = content
        if (reasoningEvents.length > 0) {
          const eventIds = new Set(reasoningEvents.map((event) => event.id))
          updates.events = [
            ...(message.events ?? []).filter((event) => !eventIds.has(event.id)),
            ...reasoningEvents,
          ]
        }
        return Object.keys(updates).length > 0 ? { ...message, ...updates } : message
      }))
    }
    const scheduleAssistantFlush = () => {
      if (assistantFlushFrame !== null) return
      assistantFlushFrame = window.requestAnimationFrame(flushAssistantBuffer)
    }
    const flushAssistantBufferNow = () => {
      if (assistantFlushFrame !== null) {
        window.cancelAnimationFrame(assistantFlushFrame)
        assistantFlushFrame = null
      }
      flushAssistantBuffer()
    }
    const cancelAssistantFlush = () => {
      if (assistantFlushFrame !== null) {
        window.cancelAnimationFrame(assistantFlushFrame)
        assistantFlushFrame = null
      }
      pendingAssistantMessageId = null
      pendingAssistantContent = null
      pendingReasoningEvents.clear()
    }
    const appendReasoningDelta = (delta: string, loop = 0) => {
      if (!delta) return
      const segment = reasoningSegments.get(loop) ?? {
        eventId: `event-local-reasoning-${serverTurnId}-${loop}`,
        text: "",
      }
      segment.text += delta
      reasoningSegments.set(loop, segment)
      const event = {
        id: segment.eventId,
        turnId: serverTurnId,
        type: "reasoning" as const,
        text: segment.text,
        createdAt: new Date().toISOString(),
      }
      ensureAssistantPlaceholder(serverTurnId, threadId, latestTurn.assistantMessageId)
      pendingAssistantMessageId = assistantPlaceholderId
      pendingReasoningEvents.set(event.id, event)
      scheduleAssistantFlush()
    }

    try {
      await sendMessageStream(bookId, text, threadId, citations, {
        constraintIds: options.constraintIds ?? threadConstraintIds[threadId] ?? [],
        temporaryConstraints: options.temporaryConstraints ?? [],
        skillIds: options.skillIds ?? [],
        parentTurnId: requestParentTurnId,
        readonlyOnly: options.readonlyOnly,
        workflowAction: options.workflowAction,
      }, {
        signal: options.signal,
        onTurn(payload) {
          serverTurnId = payload.turn.id
          latestTurn = payload.turn
          hasServerTurn = true
          setThreads((current) => upsertById(current, payload.thread))
          setActiveThreadId(payload.thread.id)
          setTurns((current) => upsertTurnById(current.filter((turn) => turn.id !== optimisticTurnId), payload.turn))
          setMessages((current) => {
            const withoutOptimistic = current.filter((message) => message.id !== optimisticUser.id)
            return [...withoutOptimistic, payload.userMessage]
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          })
          ensureAssistantPlaceholder(payload.turn.id, payload.thread.id, payload.turn.assistantMessageId)
          setSelectedTurnId(payload.turn.id)
          setActiveLeafTurnId(payload.turn.id)
        },
        onAgentEvent(event) {
          ensureAssistantPlaceholder(serverTurnId, threadId, latestTurn.assistantMessageId)
          setMessages((current) => current.map((message) => {
            if (message.id !== assistantPlaceholderId) return message
            return { ...message, events: [...(message.events ?? []), event] }
          }))
        },
        onAssistantDelta(payload) {
          ensureAssistantPlaceholder(serverTurnId, threadId, latestTurn.assistantMessageId)
          pendingAssistantMessageId = assistantPlaceholderId
          pendingAssistantContent = payload.text
          scheduleAssistantFlush()
        },
        onReasoningDelta(payload) {
          appendReasoningDelta(payload.text, payload.loop)
        },
        onAssistantMessage(message) {
          flushAssistantBufferNow()
          setMessages((current) => [
            ...current.filter((item) => item.id !== assistantPlaceholderId && item.id !== message.id),
            message,
          ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
        },
        onDone(payload) {
          flushAssistantBufferNow()
          latestTurn = payload.turn
          hasServerTurn = true
          setThreads((current) => upsertById(current, payload.thread))
          setTurns((current) => upsertTurnById(current.filter((turn) => turn.id !== optimisticTurnId), payload.turn))
          setMessages((current) => {
            const filtered = current.filter((message) =>
              message.id !== optimisticUser.id &&
              message.id !== assistantPlaceholderId &&
              message.id !== payload.userMessage.id &&
              message.id !== payload.assistantMessage?.id
            )
            return [
              ...filtered,
              payload.userMessage,
              ...(payload.assistantMessage ? [payload.assistantMessage] : []),
            ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          })
          setSelectedTurnId(payload.turn.id)
          setActiveLeafTurnId(payload.turn.id)
        },
      })
      await refreshThreadBundle(threadId, true, bookId).catch(() => null)
      void refreshBookDerivedData(bookId)
    } catch (err) {
      if (options.signal?.aborted) {
        cancelAssistantFlush()
        const cancelledAt = new Date().toISOString()
        const cancelledTurn: Turn = {
          ...latestTurn,
          status: "cancelled",
          updatedAt: cancelledAt,
        }
        setTurns((current) => upsertTurnById(current, {
          ...cancelledTurn,
        }))
        setMessages((current) => current.filter((message) => message.id !== assistantPlaceholderId))
        setSelectedTurnId(cancelledTurn.id)
        setActiveLeafTurnId(cancelledTurn.id)
        if (hasServerTurn) void refreshThreadBundle(threadId, true, bookId).catch(() => null)
        return
      }
      cancelAssistantFlush()
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
      setTurns((current) => upsertTurnById(current, failedTurn))
      setMessages((current) => [...current, assistantMessage])
      if (hasServerTurn) void refreshThreadBundle(threadId, true, bookId).catch(() => null)
    }
  }

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((current) => !current)
  }, [])

  const handleSelectBook = useCallback((id: string) => {
    setActiveBookId(id)
    setMode("chat")
    setActiveChapterId(null)
  }, [])

  const handlePrefetchBook = useCallback((id: string) => {
    if (!id || id === activeBookId) return
    if (hasSnapshot(id)) return
    void loadSnapshot(id).catch(() => {})
  }, [activeBookId, hasSnapshot, loadSnapshot])

  const handleSelectChapter = useCallback((id: string) => {
    setActiveChapterId(id)
    setMode("writing")
  }, [])

  const handleBackToChat = useCallback(() => {
    setMode("chat")
    setActiveChapterId(null)
  }, [])

  const onToggleCollapsed = useStableCallback(handleToggleCollapsed)
  const onSelectBook = useStableCallback(handleSelectBook)
  const onPrefetchBook = useStableCallback(handlePrefetchBook)
  const onSelectChapter = useStableCallback(handleSelectChapter)
  const onBackToChat = useStableCallback(handleBackToChat)
  const onNewBook = useStableCallback(handleNewBook)
  const onNewChapter = useStableCallback(handleNewChapter)
  const onDeleteChapter = useStableCallback(handleDeleteChapter)
  const onOpenWorkbench = useStableCallback(handleOpenWorkbench)
  const onRollbackLedgerEntry = useStableCallback(handleRollbackLedgerEntry)
  const onApplyProposal = useStableCallback(handleApplyProposal)
  const onDiscardProposal = useStableCallback(handleDiscardProposal)
  const onProposalApplied = useStableCallback(refreshBookDerivedData)
  const onRenameBook = useStableCallback(handleRenameBook)
  const onSelectTurn = useStableCallback((turnId: string) => setSelectedTurnId(turnId))
  const onSend = useStableCallback(handleSend)
  const onReview = useStableCallback(handleReview)
  const onAddCitation = useStableCallback(handleAddCitation)
  const onRemoveCitation = useStableCallback(handleRemoveCitation)
  const onClearCitations = useStableCallback(handleClearCitations)
  const onImportMaterials = useStableCallback(handleImportMaterials)
  const onCreateResponseConstraint = useStableCallback(handleCreateResponseConstraint)
  const onUpdateResponseConstraint = useStableCallback(handleUpdateResponseConstraint)
  const onDeleteResponseConstraint = useStableCallback(handleDeleteResponseConstraint)
  const onSetActiveResponseConstraintIds = useStableCallback(handleSetActiveResponseConstraintIds)
  const onCreateThread = useStableCallback(handleCreateThread)
  const onSelectThread = useStableCallback(handleSelectThread)
  const onRenameThread = useStableCallback(handleRenameThread)
  const onSetThreadStatus = useStableCallback(handleSetThreadStatus)
  const onForkThread = useStableCallback(handleForkThread)
  const onSelectTurnBranch = useStableCallback(handleSelectTurnBranch)
  const onSubmitEditedTurn = useStableCallback(handleSubmitEditedTurn)
  const onCloseWorkbench = useStableCallback(workbench.close)

  const activeBook = books.find((b) => b.id === activeBookId)
  const activeResponseConstraintIds = activeThreadId ? threadConstraintIds[activeThreadId] ?? [] : []

  return (
    <>
      <AppShell
        books={books}
      chapters={chapters}
      outlines={outlines}
      messages={chatThreadView.visibleMessages}
      turns={chatThreadView.visibleTurns}
      threads={threads}
      cards={cards}
      importedMaterials={importedMaterials}
      ledgerEntries={ledgerEntries}
      rollingBackLedgerEntryId={rollingBackLedgerEntryId}
      applyingProposalId={applyingProposalId}
      activeBookId={activeBookId}
      activeBookTitle={activeBook?.title ?? ""}
      activeChapterId={activeChapterId}
      activeThreadId={activeThreadId}
      selectedTurnId={selectedTurnId}
      turnBranchNavigation={chatThreadView.turnBranchNavigation}
      reviewing={reviewing}
      mode={mode}
      collapsed={collapsed}
      chatCitations={chatCitations}
      responseConstraints={responseConstraints}
      activeResponseConstraintIds={activeResponseConstraintIds}
      workbenchBook={workbench.book ?? null}
      workbenchInitialPath={workbench.initialPath}
      workbenchInitialLine={workbench.initialLine}
      workbenchInitialTab={workbench.initialTab}
      workbenchInitialLedgerEntryId={workbench.initialLedgerEntryId}
      onToggleCollapsed={onToggleCollapsed}
      onSelectBook={onSelectBook}
      onPrefetchBook={onPrefetchBook}
      onSelectChapter={onSelectChapter}
      onBackToChat={onBackToChat}
      onNewBook={onNewBook}
      onNewChapter={onNewChapter}
      onDeleteChapter={onDeleteChapter}
      onOpenWorkbench={onOpenWorkbench}
      onRollbackLedgerEntry={onRollbackLedgerEntry}
      onApplyProposal={onApplyProposal}
      onDiscardProposal={onDiscardProposal}
      onProposalApplied={onProposalApplied}
      onRenameBook={onRenameBook}
      onSelectTurn={onSelectTurn}
      onSend={onSend}
      onReview={onReview}
      onAddCitation={onAddCitation}
      onRemoveCitation={onRemoveCitation}
      onClearCitations={onClearCitations}
      onImportMaterials={onImportMaterials}
      onCreateResponseConstraint={onCreateResponseConstraint}
      onUpdateResponseConstraint={onUpdateResponseConstraint}
      onDeleteResponseConstraint={onDeleteResponseConstraint}
      onSetActiveResponseConstraintIds={onSetActiveResponseConstraintIds}
      onCreateThread={onCreateThread}
      onSelectThread={onSelectThread}
      onRenameThread={onRenameThread}
      onSetThreadStatus={onSetThreadStatus}
      onForkThread={onForkThread}
      onSelectTurnBranch={onSelectTurnBranch}
      onSubmitEditedTurn={onSubmitEditedTurn}
      onCloseWorkbench={onCloseWorkbench}
      />

      <Dialog open={newBookDialogOpen} onOpenChange={setNewBookDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建书籍</DialogTitle>
            <DialogDescription className="sr-only">创建新的项目工作区。</DialogDescription>
          </DialogHeader>
          <Input
            value={newBookTitle}
            onChange={(event) => setNewBookTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void handleCreateBookFromDialog()
              }
            }}
            autoFocus
            placeholder="请输入书名"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNewBookDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={!newBookTitle.trim() || creatingBook} onClick={() => void handleCreateBookFromDialog()}>
              {creatingBook ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
