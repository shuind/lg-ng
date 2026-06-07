"use client"

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { ArrowUp, AtSign, CornerUpLeft, Loader2, Plus } from "lucide-react"
import type { SettingCard } from "@/lib/mock-data"
import { listSkills } from "@/lib/api"
import type { ResponseConstraint, Skill } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CitationBar, PlusPicker, ReferencePicker, ResponseConstraintChipBar, SkillChipBar, ToolBtn } from "./pickers"
import type { ChatCitation, ChatSendOptions } from "./types"

export type ChatComposerHandle = {
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

export const ChatComposer = memo(forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
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

