"use client"

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import {
  ArrowUp,
  AtSign,
  CheckCircle2,
  Check,
  ChevronDown,
  CornerUpLeft,
  Copy,
  Download,
  GitBranch,
  FolderOpen,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Archive,
  Edit3,
  XCircle,
} from "lucide-react"
import type { AgentEvent, Message, SettingCard, Thread, Turn } from "@/lib/mock-data"
import { listSkills } from "@/lib/api"
import type { ResponseConstraint, Skill } from "@/lib/types"
import { cn } from "@/lib/utils"

export type ChatCitation = SettingCard
export type ChatSendOptions = {
  constraintIds: string[]
  temporaryConstraints: string[]
  skillIds: string[]
}

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
}

const ChatTranscript = memo(function ChatTranscript({
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
}: ChatTranscriptProps) {
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-8 pb-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        {messages.length === 0 && !runningTurn && <EmptyState />}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            selected={message.turnId === selectedTurnId}
            isLatestUser={message.role === "user" && message.turnId === latestUserTurnId}
            highlightedUser={message.role === "user" && message.turnId === highlightedUserTurnId}
            registerUserMessage={registerUserMessage}
            onSelectTurn={onSelectTurn}
            onForkThread={onForkThread}
            onEditLatest={onEditLatest}
          />
        ))}
        {runningTurn && <IntentAnalyzer turn={runningTurn} />}
      </div>
    </div>
  )
})

type ChatComposerHandle = {
  editLatest: (text: string) => void
}

interface ChatComposerProps {
  bookId: string
  activeThreadId: string
  activeThreadTitle: string
  citations: ChatCitation[]
  settingCards: SettingCard[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  latestUserTurnId: string | null
  onQuestionJump: () => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onAddCitation: (card: SettingCard) => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onSetActiveResponseConstraintIds: (constraintIds: string[]) => Promise<void>
}

const ChatComposer = memo(forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
  bookId,
  activeThreadId,
  activeThreadTitle,
  citations,
  settingCards,
  responseConstraints,
  activeResponseConstraintIds,
  latestUserTurnId,
  onQuestionJump,
  onSend,
  onAddCitation,
  onRemoveCitation,
  onClearCitations,
  onCreateResponseConstraint,
  onUpdateResponseConstraint,
  onDeleteResponseConstraint,
  onSetActiveResponseConstraintIds,
}, ref) {
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [constraintPickerOpen, setConstraintPickerOpen] = useState(false)
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)
  const [plusTab, setPlusTab] = useState<"constraints" | "skills">("constraints")
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillIds, setSkillIds] = useState<string[]>([])
  const [temporaryConstraints, setTemporaryConstraints] = useState<string[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeResponseConstraints = useMemo(
    () => responseConstraints.filter((constraint) => activeResponseConstraintIds.includes(constraint.id)),
    [responseConstraints, activeResponseConstraintIds],
  )
  const selectedSkills = useMemo(
    () => skills.filter((skill) => skillIds.includes(skill.id)),
    [skills, skillIds],
  )

  useImperativeHandle(ref, () => ({
    editLatest(text: string) {
      setInput(text)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
  }), [])

  useEffect(() => {
    let cancelled = false
    if (!bookId) {
      setSkills([])
      setSkillIds([])
      return
    }

    listSkills(bookId)
      .then((items) => {
        if (cancelled) return
        setSkills(items)
        setSkillIds((current) => current.filter((id) => items.some((skill) => skill.id === id)))
      })
      .catch(() => {
        if (!cancelled) setSkills([])
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("[data-chat-popover-keepopen='true']")) return
      setConstraintPickerOpen(false)
      setReferencePickerOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  useEffect(() => {
    setInput("")
    setTemporaryConstraints([])
    setSkillIds([])
    setPlusTab("constraints")
    setConstraintPickerOpen(false)
    setReferencePickerOpen(false)
  }, [activeThreadId, bookId])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput("")
    setSending(true)
    try {
      await onSend(text, citations, {
        constraintIds: activeResponseConstraintIds,
        temporaryConstraints,
        skillIds,
      })
      onClearCitations()
      setTemporaryConstraints([])
      setSkillIds([])
    } finally {
      setSending(false)
    }
  }, [activeResponseConstraintIds, citations, input, onClearCitations, onSend, sending, skillIds, temporaryConstraints])

  const handleToggleConstraint = useCallback((constraintId: string) => {
    const next = activeResponseConstraintIds.includes(constraintId)
      ? activeResponseConstraintIds.filter((id) => id !== constraintId)
      : [...activeResponseConstraintIds, constraintId]
    onSetActiveResponseConstraintIds(next)
  }, [activeResponseConstraintIds, onSetActiveResponseConstraintIds])

  const handleAddTemporaryConstraint = useCallback((instruction: string) => {
    const trimmed = instruction.trim()
    if (!trimmed) return
    setTemporaryConstraints((current) => [...current, trimmed])
  }, [])

  const handleToggleSkill = useCallback((skillId: string) => {
    setSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId],
    )
  }, [])

  const handleRemoveConstraint = useCallback((constraintId: string) => {
    onSetActiveResponseConstraintIds(activeResponseConstraintIds.filter((id) => id !== constraintId))
  }, [activeResponseConstraintIds, onSetActiveResponseConstraintIds])

  const handleRemoveTemporaryConstraint = useCallback((index: number) => {
    setTemporaryConstraints((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }, [])

  const handleRemoveSkill = useCallback((skillId: string) => {
    setSkillIds((current) => current.filter((id) => id !== skillId))
  }, [])

  return (
    <div className="px-8 pb-6 pt-2">
      <div className="mx-auto max-w-2xl">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onQuestionJump}
            disabled={!latestUserTurnId}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-3 text-[12px] text-muted-foreground shadow-sm backdrop-blur transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            title="跳到提问"
            aria-label="跳到提问"
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
            <span>跳到提问</span>
          </button>
        </div>
        <div className="paper relative rounded-2xl border border-border/70 bg-card/80 backdrop-blur transition focus-within:ring-1 focus-within:ring-ring/50 dark:bg-card/40 dark:border-border/50 dark:backdrop-blur-md">
          {(activeResponseConstraints.length > 0 || temporaryConstraints.length > 0) && (
            <ResponseConstraintChipBar
              constraints={activeResponseConstraints}
              temporaryConstraints={temporaryConstraints}
              onRemoveConstraint={handleRemoveConstraint}
              onRemoveTemporary={handleRemoveTemporaryConstraint}
            />
          )}
          {selectedSkills.length > 0 && (
            <SkillChipBar
              skills={selectedSkills}
              onRemove={handleRemoveSkill}
            />
          )}
          {citations.length > 0 && (
            <CitationBar
              citations={citations}
              onRemove={onRemoveCitation}
              onClear={onClearCitations}
            />
          )}
          {constraintPickerOpen && (
            <PlusPicker
              tab={plusTab}
              onTabChange={setPlusTab}
              constraints={responseConstraints}
              activeConstraintIds={activeResponseConstraintIds}
              onToggleConstraint={handleToggleConstraint}
              onCreateConstraint={onCreateResponseConstraint}
              onUpdateConstraint={onUpdateResponseConstraint}
              onDeleteConstraint={onDeleteResponseConstraint}
              onAddTemporaryConstraint={handleAddTemporaryConstraint}
              skills={skills}
              selectedSkillIds={skillIds}
              onToggleSkill={handleToggleSkill}
            />
          )}
          {referencePickerOpen && (
            <ReferencePicker
              cards={settingCards}
              citations={citations}
              onAddCitation={onAddCitation}
              onRemoveCitation={onRemoveCitation}
            />
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={sending}
            rows={2}
            placeholder="描述你想做的修改、新建,或粘贴一段设定..."
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 font-serif text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-70"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1" data-chat-popover-keepopen="true">
              <ToolBtn
                icon={<Plus className="h-3.5 w-3.5" />}
                label="约束 / Skill"
                active={constraintPickerOpen}
                onClick={() => {
                  setConstraintPickerOpen((open) => !open)
                  setReferencePickerOpen(false)
                }}
              />
              <ToolBtn
                icon={<AtSign className="h-3.5 w-3.5" />}
                label="引用设定"
                active={referencePickerOpen}
                onClick={() => {
                  setReferencePickerOpen((open) => !open)
                  setConstraintPickerOpen(false)
                }}
              />
              <span className="ml-2 max-w-[180px] truncate text-[11px] text-muted-foreground/70">
                {activeThreadTitle}
              </span>
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition",
                input.trim() && !sending
                  ? "bg-foreground text-background hover:scale-105"
                  : "bg-muted text-muted-foreground/50",
              )}
              aria-label="发送"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <p className="mt-2 px-1 text-center text-[10px] text-muted-foreground/60">
          按 Enter 发送 · Shift+Enter 换行 · 写入会记录到 Ledger
        </p>
      </div>
    </div>
  )
}))

function CitationBar({
  citations,
  onRemove,
  onClear,
}: {
  citations: ChatCitation[]
  onRemove: (cardId: string) => void
  onClear: () => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>引用上下文</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal transition hover:bg-secondary hover:text-foreground"
        >
          清空
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((card) => (
          <span
            key={card.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-foreground ring-1 ring-border/50"
          >
            <AtSign className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{card.name}</span>
            {card.path && <span className="hidden max-w-[160px] truncate font-mono text-muted-foreground sm:inline">{card.path}</span>}
            <button
              type="button"
              onClick={() => onRemove(card.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除引用 ${card.name}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

function ResponseConstraintChipBar({
  constraints,
  temporaryConstraints,
  onRemoveConstraint,
  onRemoveTemporary,
}: {
  constraints: ResponseConstraint[]
  temporaryConstraints: string[]
  onRemoveConstraint: (constraintId: string) => void
  onRemoveTemporary: (index: number) => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">回复约束</div>
      <div className="flex flex-wrap gap-1.5">
        {constraints.map((constraint) => (
          <span
            key={constraint.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-foreground ring-1 ring-border/50"
          >
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{constraint.title}</span>
            <button
              type="button"
              onClick={() => onRemoveConstraint(constraint.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除回复约束 ${constraint.title}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
        {temporaryConstraints.map((instruction, index) => (
          <span
            key={`${instruction}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent/20 px-2 py-1 text-[11px] text-foreground ring-1 ring-accent/30"
          >
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">本轮: {instruction}</span>
            <button
              type="button"
              onClick={() => onRemoveTemporary(index)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="移除本轮临时约束"
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

function SkillChipBar({
  skills,
  onRemove,
}: {
  skills: Skill[]
  onRemove: (skillId: string) => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Skill</div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span
            key={skill.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/5 px-2 py-1 text-[11px] text-foreground ring-1 ring-primary/20"
          >
            <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{skillDisplayName(skill)}</span>
            <span className="hidden rounded bg-muted/60 px-1 text-[10px] text-muted-foreground sm:inline">
              {skillTypeLabel(skill)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(skill.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除 Skill ${skillDisplayName(skill)}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

function PlusPicker({
  tab,
  onTabChange,
  constraints,
  activeConstraintIds,
  onToggleConstraint,
  onCreateConstraint,
  onUpdateConstraint,
  onDeleteConstraint,
  onAddTemporaryConstraint,
  skills,
  selectedSkillIds,
  onToggleSkill,
}: {
  tab: "constraints" | "skills"
  onTabChange: (tab: "constraints" | "skills") => void
  constraints: ResponseConstraint[]
  activeConstraintIds: string[]
  onToggleConstraint: (constraintId: string) => void
  onCreateConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteConstraint: (constraintId: string) => Promise<void>
  onAddTemporaryConstraint: (instruction: string) => void
  skills: Skill[]
  selectedSkillIds: string[]
  onToggleSkill: (skillId: string) => void
}) {
  return (
    <div
      data-chat-popover-keepopen="true"
      className="border-b border-border/60 bg-popover/95 px-3 py-3 text-[12px] text-popover-foreground shadow-sm"
    >
      <div className="mb-3 inline-flex rounded-lg bg-muted/50 p-0.5">
        <PlusTabButton active={tab === "constraints"} onClick={() => onTabChange("constraints")}>
          约束
        </PlusTabButton>
        <PlusTabButton active={tab === "skills"} onClick={() => onTabChange("skills")}>
          Skill
        </PlusTabButton>
      </div>

      {tab === "constraints" ? (
        <ResponseConstraintPicker
          constraints={constraints}
          activeIds={activeConstraintIds}
          onToggle={onToggleConstraint}
          onCreate={onCreateConstraint}
          onUpdate={onUpdateConstraint}
          onDelete={onDeleteConstraint}
          onAddTemporary={onAddTemporaryConstraint}
        />
      ) : (
        <SkillPicker
          skills={skills}
          selectedIds={selectedSkillIds}
          onToggle={onToggleSkill}
        />
      )}
    </div>
  )
}

function PlusTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-[11px] transition",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function SkillPicker({
  skills,
  selectedIds,
  onToggle,
}: {
  skills: Skill[]
  selectedIds: string[]
  onToggle: (skillId: string) => void
}) {
  return (
    <div className="space-y-2">
      {skills.map((skill) => {
        const selected = selectedIds.includes(skill.id)
        return (
          <button
            key={skill.id}
            type="button"
            onClick={() => onToggle(skill.id)}
            className={cn(
              "flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition",
              selected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40 hover:bg-secondary/60",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {selected && <Check className="h-3 w-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12px] font-medium text-foreground">{skillDisplayName(skill)}</span>
                <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {skillTypeLabel(skill)}
                </span>
                {skill.dirty && (
                  <span className="shrink-0 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-foreground">
                    需刷新
                  </span>
                )}
              </span>
              {skill.description && (
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {skill.description}
                </span>
              )}
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
                {skill.summaryFile || skill.sourceFile}
              </span>
            </span>
          </button>
        )
      })}
      {skills.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
          暂无 Skill
        </div>
      )}
    </div>
  )
}

function skillTypeLabel(skill: Skill): string {
  if (skill.source === "style_guide" || skill.type === "style_guide") return "创作指南"
  if (skill.source === "claude_skill") return "本地 Skill"
  return skill.type
}

function skillDisplayName(skill: Skill): string {
  return skill.name || (skill.type === "style_guide" ? "创作指南" : skill.id)
}

function ResponseConstraintPicker({
  constraints,
  activeIds,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  onAddTemporary,
}: {
  constraints: ResponseConstraint[]
  activeIds: string[]
  onToggle: (constraintId: string) => void
  onCreate: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdate: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDelete: (constraintId: string) => Promise<void>
  onAddTemporary: (instruction: string) => void
}) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftInstruction, setDraftInstruction] = useState("")
  const [temporaryText, setTemporaryText] = useState("")
  const [saving, setSaving] = useState(false)
  const filteredConstraints = constraints.filter((constraint) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${constraint.title} ${constraint.instruction}`.toLowerCase().includes(needle)
  })

  function startNew() {
    setEditingId("new")
    setDraftTitle("")
    setDraftInstruction("")
  }

  function startEdit(constraint: ResponseConstraint) {
    setEditingId(constraint.id)
    setDraftTitle(constraint.title)
    setDraftInstruction(constraint.instruction)
  }

  async function saveDraft() {
    const title = draftTitle.trim()
    const instruction = draftInstruction.trim()
    if (!title || !instruction || saving) return
    setSaving(true)
    try {
      if (editingId === "new") {
        await onCreate({ title, instruction })
      } else if (editingId) {
        await onUpdate({ id: editingId, title, instruction })
      }
      setEditingId(null)
      setDraftTitle("")
      setDraftInstruction("")
    } finally {
      setSaving(false)
    }
  }

  async function deleteConstraint(constraint: ResponseConstraint) {
    if (!window.confirm(`删除回复约束「${constraint.title}」？`)) return
    await onDelete(constraint.id)
  }

  function addTemporary() {
    const instruction = temporaryText.trim()
    if (!instruction) return
    onAddTemporary(instruction)
    setTemporaryText("")
  }

  return (
    <div className="text-[12px] text-popover-foreground">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-medium text-foreground">回复约束</div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          新建
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索约束"
          className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
        />
      </div>

      {editingId && (
        <div className="mb-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="标题"
            className="w-full rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring/50"
          />
          <textarea
            value={draftInstruction}
            onChange={(event) => setDraftInstruction(event.target.value)}
            placeholder="指令"
            rows={3}
            className="w-full resize-none rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring/50"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={!draftTitle.trim() || !draftInstruction.trim() || saving}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] text-background transition hover:opacity-90 disabled:opacity-40"
            >
              <Check className="h-3 w-3" />
              保存
            </button>
          </div>
        </div>
      )}

      <div className="max-h-52 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
        {filteredConstraints.map((constraint) => {
          const active = activeIds.includes(constraint.id)
          return (
            <div
              key={constraint.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2 py-2 transition",
                active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40",
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(constraint.id)}
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                )}
                aria-label={active ? `取消约束 ${constraint.title}` : `启用约束 ${constraint.title}`}
              >
                {active && <Check className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => onToggle(constraint.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-[12px] font-medium text-foreground">{constraint.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {constraint.instruction}
                </div>
              </button>
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={() => startEdit(constraint)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={`编辑 ${constraint.title}`}
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteConstraint(constraint)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={`删除 ${constraint.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
        {filteredConstraints.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
            暂无匹配约束
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          value={temporaryText}
          onChange={(event) => setTemporaryText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addTemporary()
            }
          }}
          placeholder="本轮临时约束"
          className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
        />
        <button
          type="button"
          onClick={addTemporary}
          disabled={!temporaryText.trim()}
          className="rounded-md bg-foreground px-2.5 py-1 text-[11px] text-background transition hover:opacity-90 disabled:opacity-40"
        >
          添加
        </button>
      </div>
    </div>
  )
}

function ReferencePicker({
  cards,
  citations,
  onAddCitation,
  onRemoveCitation,
}: {
  cards: SettingCard[]
  citations: ChatCitation[]
  onAddCitation: (card: SettingCard) => void
  onRemoveCitation: (cardId: string) => void
}) {
  const [query, setQuery] = useState("")
  const selectedIds = new Set(citations.map((card) => card.id))
  const filteredCards = cards.filter((card) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${card.name} ${card.summary} ${card.category} ${card.path ?? ""}`.toLowerCase().includes(needle)
  })

  return (
    <div
      data-chat-popover-keepopen="true"
      className="border-b border-border/60 bg-popover/95 px-3 py-3 text-[12px] text-popover-foreground shadow-sm"
    >
      <div className="mb-2 font-medium text-foreground">引用设定</div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索设定卡"
          className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
        />
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
        {filteredCards.map((card) => {
          const selected = selectedIds.has(card.id)
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => selected ? onRemoveCitation(card.id) : onAddCitation(card)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition",
                selected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40 hover:bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                )}
              >
                {selected && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-foreground">{card.name}</span>
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {card.category}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {card.summary}
                </span>
                {card.path && (
                  <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground/70">
                    {card.path}
                  </span>
                )}
              </span>
            </button>
          )
        })}
        {filteredCards.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
            暂无匹配设定
          </div>
        )}
      </div>
    </div>
  )
}

function ToolBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-secondary hover:text-foreground",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
      )}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

type ExportMode = "simple" | "full"

function ExportMenu({
  bookTitle,
  threadTitle,
  messages,
  selectedTurnId,
}: {
  bookTitle: string
  threadTitle: string
  messages: Message[]
  selectedTurnId: string | null
}) {
  const [open, setOpen] = useState(false)
  const exportMessages = getExportMessages(messages, selectedTurnId)
  const disabled = exportMessages.length === 0

  function handleExport(mode: ExportMode) {
    if (disabled) return
    const exportedAt = new Date()
    const markdown = buildChatExportMarkdown({
      bookTitle,
      threadTitle,
      messages: exportMessages,
      exportedAt,
      mode,
    })
    const stamp = formatFilenameDate(exportedAt)
    const suffix = mode === "full" ? "-完整信息" : ""
    const filename = sanitizeFilename(`${bookTitle || "未命名书籍"}-${threadTitle || "任务线程"}-${stamp}${suffix}.md`)
    downloadMarkdown(filename, markdown)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-card/60 text-muted-foreground ring-1 ring-border/60 backdrop-blur transition hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? "暂无可导出的对话" : "导出对话"}
        aria-label="导出对话"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 top-9 z-30 w-36 rounded-xl border border-border/70 bg-popover p-1.5 text-[12px] text-popover-foreground shadow-lg">
            <button
            type="button"
            onClick={() => handleExport("simple")}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left transition hover:bg-secondary"
          >
            导出对话
          </button>
            <button
            type="button"
            onClick={() => handleExport("full")}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left transition hover:bg-secondary"
          >
            导出完整信息
          </button>
        </div>
      )}
    </div>
  )
}

function ThreadMenu({
  threads,
  activeThread,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onSetThreadStatus,
}: {
  threads: Thread[]
  activeThread?: Thread
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
}) {
  const [open, setOpen] = useState(false)
  const activeThreads = threads.filter((thread) => thread.status === "active")
  const archivedThreads = threads.filter((thread) => thread.status === "archived")

  function renameCurrent() {
    if (!activeThread) return
    const title = window.prompt("重命名任务线程", activeThread.title)
    if (!title?.trim()) return
    onRenameThread(activeThread.id, title.trim())
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[260px] items-center gap-2 rounded-full bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground ring-1 ring-border/60 backdrop-blur transition hover:bg-card hover:text-foreground"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2 animate-pulse-dot" />
        <span className="truncate">{activeThread?.title ?? "任务线程"}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-border/70 bg-popover p-2 text-[12px] text-popover-foreground shadow-lg">
          <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active Threads</div>
          <div className="max-h-48 overflow-y-auto">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onSelectThread(thread.id)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-secondary"
              >
                {thread.id === activeThread?.id ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              </button>
            ))}
            {activeThreads.length === 0 && <div className="px-2 py-2 text-muted-foreground">暂无 active thread</div>}
          </div>
          {archivedThreads.length > 0 && (
            <>
              <div className="mt-2 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Archived</div>
              {archivedThreads.map((thread) => (
                <div key={thread.id} className="flex items-center gap-1 rounded-md px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{thread.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onSetThreadStatus(thread.id, "active")
                    }}
                    className="rounded px-1.5 py-0.5 text-[11px] transition hover:bg-secondary hover:text-foreground"
                  >
                    恢复
                  </button>
                </div>
              ))}
            </>
          )}
          <div className="my-2 h-px bg-border/70" />
          <div className="grid grid-cols-2 gap-1">
            <MenuButton
              onClick={() => {
                setOpen(false)
                onCreateThread()
              }}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              新建
            </MenuButton>
            <MenuButton
              onClick={() => {
                setOpen(false)
                renameCurrent()
              }}
              icon={<Edit3 className="h-3.5 w-3.5" />}
            >
              重命名
            </MenuButton>
            <MenuButton
              onClick={() => {
                if (!activeThread) return
                setOpen(false)
                onSetThreadStatus(activeThread.id, "archived")
              }}
              icon={<Archive className="h-3.5 w-3.5" />}
              disabled={!activeThread}
            >
              归档
            </MenuButton>
            <MenuButton
              onClick={() => {
                if (!activeThread) return
                if (!window.confirm(`删除线程「${activeThread.title}」？`)) return
                setOpen(false)
                onSetThreadStatus(activeThread.id, "deleted")
              }}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              disabled={!activeThread}
            >
              删除
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  )
}

const MessageBubble = memo(function MessageBubble({
  message,
  selected,
  isLatestUser,
  highlightedUser,
  registerUserMessage,
  onSelectTurn,
  onForkThread,
  onEditLatest,
}: {
  message: Message
  selected: boolean
  isLatestUser: boolean
  highlightedUser: boolean
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
  onEditLatest: (content: string) => void
}) {
  const [assistantCopied, setAssistantCopied] = useState(false)
  const copyResetRef = useRef<number | null>(null)
  const isAssistant = message.role === "assistant"
  const userMessageRef = useCallback((element: HTMLDivElement | null) => {
    if (message.role === "user") registerUserMessage(message.turnId, element)
  }, [message.role, message.turnId, registerUserMessage])

  useEffect(() => {
    return () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
    }
  }, [])

  function handleCopyAssistant() {
    navigator.clipboard?.writeText(message.content).then(() => {
      setAssistantCopied(true)
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
      copyResetRef.current = window.setTimeout(() => setAssistantCopied(false), 1200)
    }).catch(() => {})
  }

  if (message.role === "user") {
    return (
      <div ref={userMessageRef} className="group flex items-end justify-end gap-2">
        <div className="mb-0.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              navigator.clipboard?.writeText(message.content).catch(() => {})
            }}
            className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="复制"
            aria-label="复制"
          >
            <Copy className="h-3 w-3" />
          </button>
          {isLatestUser && (
            <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onEditLatest(message.content)
            }}
            className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title={isLatestUser ? "编辑" : "分叉"}
            aria-label={isLatestUser ? "编辑" : "分叉"}
          >
              <Edit3 className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex max-w-[80%] flex-col items-end gap-1">
          <div
            className={cn(
              "paper max-w-full rounded-2xl rounded-br-md bg-secondary/80 px-4 py-2.5 text-[14px] leading-relaxed text-secondary-foreground ring-1 transition",
              highlightedUser
                ? "bg-primary/10 ring-2 ring-primary/70 shadow-sm"
                : selected
                  ? "ring-primary/50"
                  : "ring-border/60",
            )}
            onClick={() => onSelectTurn(message.turnId)}
          >
            {message.content}
          </div>
          {message.constraints && message.constraints.length > 0 && (
            <div className="flex max-w-full flex-wrap justify-end gap-1">
              {message.constraints.map((constraint, index) => (
                <span
                  key={`${constraint.id ?? constraint.title}-${index}`}
                  className="max-w-[220px] truncate rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/40"
                  title={constraint.instruction}
                >
                  {constraint.source === "temporary" ? "本轮" : constraint.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl px-3 py-2 transition",
        isAssistant && "pr-10",
        selected && "bg-muted/30 ring-1 ring-border/70",
      )}
      onClick={() => onSelectTurn(message.turnId)}
    >
      {isAssistant && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border/70 bg-background/90 p-0.5 opacity-0 shadow-sm backdrop-blur transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleCopyAssistant()
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="复制回复"
            aria-label="复制回复"
          >
            {assistantCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      )}
      {message.thought && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 opacity-60" />
          <span className="italic">
            Thought for {message.thoughtSeconds}s · {message.thought}
          </span>
        </div>
      )}
      <MarkdownContent content={message.content} />

      {(message.brief || (message.events && message.events.length > 0)) && (
        <RunDetailsCard brief={message.brief} events={message.events ?? []} />
      )}

      {message.references && message.references.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {message.references.map((reference) => (
            <span
              key={reference.path}
              className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border/50"
            >
              {reference.path}
            </span>
          ))}
        </div>
      )}
      {isAssistant && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleCopyAssistant()
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="复制回复"
            aria-label="复制回复"
          >
            {assistantCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>复制</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onForkThread(message.turnId)
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="分叉"
            aria-label="分叉"
          >
            <GitBranch className="h-3 w-3" />
            <span>分叉</span>
          </button>
        </div>
      )}
    </div>
  )
})

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "hr" }

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content])

  return (
    <div className="space-y-3 break-words font-serif text-[15px] leading-[1.75] text-foreground">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  )
})

function RunDetailsCard({
  brief,
  events,
}: {
  brief?: Message["brief"]
  events: AgentEvent[]
}) {
  const toolTrace = brief?.toolTrace ?? events
    .filter((event) => event.type === "tool_call")
    .map((event) => event.text ?? event.name ?? "")
    .filter(Boolean)
  const failures = [
    ...(brief?.diagnosis ?? []).filter((item) => !item.startsWith("Token usage:")),
    ...events.filter((event) => event.type === "error").map((event) => event.message ?? event.text ?? "处理失败"),
  ]
  const visibleNotes = [
    ...(brief?.recommendations ?? []).filter((item) => !item.startsWith("Token usage:")),
    ...(brief?.missing ?? []).map((item) => `缺少：${item}`),
  ].slice(0, 4)
  const contextPaths = brief?.contextPaths ?? events.flatMap((event) => event.paths ?? [])
  const changedPaths = brief?.changedPaths ?? events.flatMap((event) => event.paths ?? [])
  const toolSummary = summarizeToolTrace(toolTrace)
  const hasDetails = toolTrace.length > 0 || failures.length > 0 || visibleNotes.length > 0 || contextPaths.length > 0 || changedPaths.length > 0

  if (!hasDetails) return null

  return (
    <details className="group mt-1 rounded-lg border border-border/50 bg-muted/20 text-[12px] text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <ListChecks className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-foreground/80">处理细节</span>
        <span className="min-w-0 flex-1 truncate">{failures.length > 0 ? `${failures.length} 个问题` : toolSummary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-border/40 px-3 py-2">
        {contextPaths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dedupe(contextPaths).slice(0, 3).map((item) => (
              <span key={item} className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10.5px]">
                {formatContextPath(item)}
              </span>
            ))}
          </div>
        )}
        {changedPaths.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground/80">已修改</div>
            <div className="flex flex-wrap gap-1.5">
              {dedupe(changedPaths).slice(0, 6).map((item) => (
                <span key={item} className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10.5px]">
                  {formatContextPath(item)}
                </span>
              ))}
            </div>
          </div>
        )}
        {toolTrace.length > 0 && <div>{toolSummary}</div>}
        {visibleNotes.length > 0 && (
          <ul className="space-y-0.5">
            {visibleNotes.map((item, index) => (
              <li key={index}>- {item}</li>
            ))}
          </ul>
        )}
        {failures.length > 0 && (
          <ul className="space-y-0.5 text-destructive">
            {dedupe(failures).slice(0, 5).map((item, index) => (
              <li key={index}>- {item}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: "code", text: codeLines.join("\n") })
      continue
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: "hr" })
      index += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] })
      index += 1
      continue
    }

    if (trimmed.startsWith(">")) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      blocks.push({ type: "blockquote", text: quote.join("\n") })
      continue
    }

    if (isTableStart(lines, index)) {
      const headers = parseTableRow(lines[index])
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: "table", headers, rows })
      continue
    }

    const listMatch = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
    if (listMatch) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
        if (!match || /^\s*\d+[.)]/.test(lines[index]) !== ordered) break
        items.push(match[1])
        index += 1
      }
      blocks.push({ type: "list", ordered, items })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !startsMarkdownBlock(lines, index)) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") })
  }

  return blocks
}

function renderMarkdownBlock(block: MarkdownBlock, key: number) {
  switch (block.type) {
    case "heading": {
      const className = block.level === 1
        ? "mt-1 font-serif text-xl font-semibold leading-snug text-foreground"
        : block.level === 2
          ? "mt-4 font-serif text-lg font-semibold leading-snug text-foreground"
          : "mt-3 font-serif text-[16px] font-semibold leading-snug text-foreground"
      if (block.level === 1) return <h1 key={key} className={className}>{renderInline(block.text)}</h1>
      if (block.level === 2) return <h2 key={key} className={className}>{renderInline(block.text)}</h2>
      if (block.level === 3) return <h3 key={key} className={className}>{renderInline(block.text)}</h3>
      return <h4 key={key} className={className}>{renderInline(block.text)}</h4>
    }
    case "paragraph":
      return <p key={key}>{renderInlineWithBreaks(block.text)}</p>
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-2 border-primary/50 pl-3 text-foreground/85">
          {renderInlineWithBreaks(block.text)}
        </blockquote>
      )
    case "list": {
      const Tag = block.ordered ? "ol" : "ul"
      return (
        <Tag key={key} className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}
        </Tag>
      )
    }
    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded-md border border-border/60">
          <table className="min-w-full border-collapse text-left text-[13px] leading-relaxed">
            <thead className="bg-muted/60">
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index} className="border-b border-border/60 px-3 py-1.5 font-medium">
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border/40">
                  {block.headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-1.5 align-top">
                      {renderInline(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case "code":
      return (
        <pre key={key} className="overflow-x-auto rounded-md bg-muted/60 p-3 font-mono text-[12px] leading-relaxed">
          <code>{block.text}</code>
        </pre>
      )
    case "hr":
      return <div key={key} className="h-px bg-border/70" />
  }
}

function renderInlineWithBreaks(text: string) {
  return text.split("\n").flatMap((line, index) => (
    index === 0 ? renderInline(line) : [<br key={`br-${index}`} />, ...renderInline(line)]
  ))
}

function renderInline(text: string) {
  const nodes: React.ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`${match.index}-code`} className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.88em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(<strong key={`${match.index}-strong`} className="font-semibold">{token.slice(2, -2)}</strong>)
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

function startsMarkdownBlock(lines: string[], index: number): boolean {
  const trimmed = lines[index].trim()
  return Boolean(
    !trimmed ||
      trimmed.startsWith("```") ||
      trimmed.startsWith(">") ||
      /^---+$/.test(trimmed) ||
      /^(#{1,4})\s+/.test(trimmed) ||
      /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index]) ||
      isTableStart(lines, index),
  )
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(
    lines[index]?.includes("|") &&
      lines[index + 1] &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]),
  )
}

function parseTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1)
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1)
  return trimmed.split("|").map((cell) => cell.trim())
}

function summarizeToolTrace(toolTrace: string[]): string {
  if (toolTrace.length === 0) return "处理完成"
  const counts = new Map<string, number>()
  for (const item of toolTrace) {
    const name = item.split(":")[0]?.trim() || "tool"
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  const readCount = counts.get("read_file") ?? 0
  const searchCount = (counts.get("glob") ?? 0) + (counts.get("grep") ?? 0)
  const writeCount = (counts.get("write_file") ?? 0) + (counts.get("edit_file") ?? 0)
  const otherCount = toolTrace.length - readCount - searchCount - writeCount
  const parts = [
    readCount > 0 ? `读取 ${readCount} 个文件` : "",
    searchCount > 0 ? `检索 ${searchCount} 次` : "",
    writeCount > 0 ? `写入 ${writeCount} 次` : "",
    otherCount > 0 ? `调用工具 ${otherCount} 次` : "",
  ].filter(Boolean)

  return parts.join("，") || `调用工具 ${toolTrace.length} 次`
}

function formatContextPath(item: string): string {
  const normalized = item.replace(/\\/g, "/")
  const marker = "/.lg-data/books/"
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex >= 0) return normalized.slice(markerIndex + marker.length)
  const parts = normalized.split("/").filter(Boolean)
  return parts.slice(-2).join("/") || item
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function eventLabel(type: AgentEvent["type"] | string): string {
  switch (type) {
    case "observe":
      return "理解任务"
    case "retrieve":
      return "读取上下文"
    case "plan":
      return "整理思路"
    case "tool_call":
      return "调用工具"
    case "done":
      return "处理完成"
    case "error":
      return "处理失败"
    default:
      return "历史事件"
  }
}

function getExportMessages(messages: Message[], selectedTurnId: string | null): Message[] {
  if (!selectedTurnId) return messages
  const selectedIndex = messages.findLastIndex((message) => message.turnId === selectedTurnId)
  if (selectedIndex < 0) return messages
  return messages.slice(0, selectedIndex + 1)
}

function buildChatExportMarkdown({
  bookTitle,
  threadTitle,
  messages,
  exportedAt,
  mode,
}: {
  bookTitle: string
  threadTitle: string
  messages: Message[]
  exportedAt: Date
  mode: ExportMode
}): string {
  const lines: string[] = [
    `# ${bookTitle || "未命名书籍"} - ${threadTitle || "任务线程"}`,
    "",
    `- 导出时间: ${formatDisplayDate(exportedAt.toISOString())}`,
    `- 导出范围: ${messages.length} 条消息`,
    `- 导出模式: ${mode === "full" ? "完整信息" : "对话"}`,
    "",
  ]

  for (const message of messages) {
    lines.push(`## ${roleLabel(message.role)} - ${formatDisplayDate(message.createdAt)}`)
    lines.push("")
    lines.push(message.content.trim() || "（空消息）")
    lines.push("")

    if (message.references && message.references.length > 0) {
      lines.push("### 引用路径")
      for (const reference of message.references) {
        const label = [reference.name, reference.path].filter(Boolean).join(" - ")
        lines.push(`- ${label || reference.type}`)
      }
      lines.push("")
    }

    if (mode === "full") {
      appendFullMessageDetails(lines, message)
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`
}

function appendFullMessageDetails(lines: string[], message: Message) {
  if (message.constraints && message.constraints.length > 0) {
    lines.push("### 回复约束")
    for (const constraint of message.constraints) {
      const prefix = constraint.source === "temporary" ? "本轮" : constraint.title
      lines.push(`- ${prefix}: ${constraint.instruction}`)
    }
    lines.push("")
  }

  if (message.thought) {
    lines.push("### Thought")
    lines.push(`- 用时: ${message.thoughtSeconds ?? 0}s`)
    lines.push(`- 内容: ${message.thought}`)
    lines.push("")
  }

  if (message.brief) {
    appendBriefMarkdown(lines, message.brief)
  }

  if (message.events && message.events.length > 0) {
    lines.push("### 行动摘要")
    for (const event of message.events) {
      lines.push(`- ${eventLabel(event.type)}: ${event.text ?? event.message ?? event.name ?? ""}`.trim())
      if (event.paths && event.paths.length > 0) {
        for (const path of event.paths) {
          lines.push(`  - ${path}`)
        }
      }
      if (event.steps && event.steps.length > 0) {
        for (const step of event.steps) {
          lines.push(`  - ${step}`)
        }
      }
    }
    lines.push("")
  }
}

function appendBriefMarkdown(lines: string[], brief: NonNullable<Message["brief"]>) {
  lines.push("### Brief")
  appendListSection(lines, "我理解的任务", brief.understood)
  appendListSection(lines, "使用的上下文", brief.contextPaths)
  appendListSection(lines, "修改的文件", brief.changedPaths)
  appendListSection(lines, "诊断", brief.diagnosis)
  appendListSection(lines, "建议", brief.recommendations)
  if (brief.investigation) {
    lines.push("- 主动调查:")
    lines.push(`  - 目标: ${brief.investigation.goal}`)
    appendNestedList(lines, "源文件", brief.investigation.sources)
    appendNestedList(lines, "确认事实", brief.investigation.findings)
    appendNestedList(lines, "未确认", brief.investigation.unresolved)
  }
  if (brief.factCheck) {
    lines.push("- 事实核对:")
    appendNestedList(lines, "已核对", brief.factCheck.checked)
    appendNestedList(lines, "已纠正", brief.factCheck.corrected)
    appendNestedList(lines, "未确认", brief.factCheck.unresolved)
  }
  appendListSection(lines, "上下文片段", brief.usedFragments)
  appendListSection(lines, "工具轨迹", brief.toolTrace)
  appendListSection(lines, "缺失信息", brief.missing)

  if (brief.taskModel) {
    lines.push("- 任务模型:")
    lines.push(`  - 用户目标: ${brief.taskModel.userGoal}`)
    lines.push(`  - 类型: ${brief.taskModel.taskType}`)
    lines.push(`  - 层级: ${brief.taskModel.artifactLevel}`)
    lines.push(`  - 领域: ${brief.taskModel.targetDomain ?? "unknown"}`)
    lines.push(`  - 置信度: ${brief.taskModel.confidence.toFixed(2)}`)
    lines.push(`  - 写入: ${brief.taskModel.needsBookMutation ? "yes" : "no"}`)
    lines.push(`  - 诊断: ${brief.taskModel.needsCreativeDiagnosis ? "yes" : "no"}`)
    lines.push(`  - Prompt brief: ${brief.taskModel.needsPromptBrief ? "yes" : "no"}`)
    if (brief.taskModel.domainReasoning) {
      lines.push(`  - 理由: ${brief.taskModel.domainReasoning}`)
    }
    appendNestedList(lines, "缺失产物", brief.taskModel.missingArtifacts)
  }

  if (brief.selfImprovement) {
    lines.push("- 系统复盘:")
    lines.push(`  - 触发: ${brief.selfImprovement.triggered ? "yes" : "no"}`)
    if (brief.selfImprovement.triggerReason) {
      lines.push(`  - 原因: ${brief.selfImprovement.triggerReason}`)
    }
    appendNestedList(lines, "失败链路", brief.selfImprovement.failureChain)
    appendNestedList(lines, "失败层级", brief.selfImprovement.failureLayers)
    if (brief.selfImprovement.codexBrief) {
      lines.push("  - Codex brief:")
      lines.push(indentBlock(brief.selfImprovement.codexBrief, "    "))
    }
    appendNestedList(lines, "评估用例", brief.selfImprovement.proposedEvalCases)
    appendNestedList(lines, "运行规则", brief.selfImprovement.proposedRules)
  }

  lines.push("")
}

function appendListSection(lines: string[], label: string, items?: string[]) {
  if (!items || items.length === 0) return
  lines.push(`- ${label}:`)
  for (const item of items) {
    lines.push(`  - ${item}`)
  }
}

function appendNestedList(lines: string[], label: string, items?: string[]) {
  if (!items || items.length === 0) return
  lines.push(`  - ${label}:`)
  for (const item of items) {
    lines.push(`    - ${item}`)
  }
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join("\n")
}

function roleLabel(role: Message["role"]): string {
  if (role === "user") return "用户"
  if (role === "assistant") return "助手"
  return "系统"
}

function formatDisplayDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatFilenameDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("")
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
  return cleaned || "chat-export.md"
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function IntentAnalyzer({ turn }: { turn: Turn }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border/50">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-[12px] text-foreground">LG 正在处理这轮请求...</div>
        <div className="flex gap-1.5 text-[10px] text-muted-foreground">
          <Step done>Observe</Step>
          <Step active>Retrieve</Step>
          <Step>Ground</Step>
          <Step>Plan</Step>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground/70">{turn.id}</div>
      </div>
    </div>
  )
}

function Step({
  children,
  done,
  active,
}: {
  children: React.ReactNode
  done?: boolean
  active?: boolean
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono",
        done && "bg-chart-2/20 text-chart-2",
        active && "bg-accent/30 text-accent-foreground animate-pulse-dot",
        !done && !active && "text-muted-foreground/50",
      )}
    >
      {children}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-accent/30 to-transparent ring-1 ring-border/50 animate-breathe">
        <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-accent-foreground/70" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-serif text-2xl tracking-wide text-foreground">系统 Agent 已就绪</h2>
        <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          描述你想对世界观、人物、情节做的改动。涉及写入时，我会直接协作修改项目文件，并留下可追踪记录。
        </p>
      </div>
    </div>
  )
}
