"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Copy, Edit3 } from "lucide-react"
import type { Message } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { TurnBranchNavigation } from "./types"

export function UserMessageBubble({
  message,
  selected,
  highlightedUser,
  branchNavigation,
  registerUserMessage,
  onSelectTurn,
  onSelectTurnBranch,
  onSubmitEditedTurn,
}: {
  message: Message
  selected: boolean
  highlightedUser: boolean
  branchNavigation?: TurnBranchNavigation
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  onSelectTurn: (turnId: string) => void
  onSelectTurnBranch: (turnId: string) => void
  onSubmitEditedTurn: (turnId: string, content: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const userMessageRef = useCallback((element: HTMLDivElement | null) => {
    registerUserMessage(message.turnId, element)
  }, [message.turnId, registerUserMessage])

  useEffect(() => {
    if (!editing) setDraft(message.content)
  }, [editing, message.content])

  useEffect(() => {
    if (!editing) return
    const textarea = textareaRef.current
    textarea?.focus()
    const end = textarea?.value.length ?? 0
    textarea?.setSelectionRange(end, end)
  }, [editing])

  function submitEdit() {
    const text = draft.trim()
    if (!text) return
    setEditing(false)
    void onSubmitEditedTurn(message.turnId, text)
  }

  return (
    <div ref={userMessageRef} className="group flex justify-end">
      <div className="flex max-w-[80%] flex-col items-end gap-1.5">
        {editing ? (
          <div
            className={cn(
              "paper w-[min(620px,80vw)] rounded-2xl bg-secondary/80 p-3 text-secondary-foreground ring-1 ring-border/70",
              selected && "ring-primary/50",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault()
                  setDraft(message.content)
                  setEditing(false)
                  return
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  submitEdit()
                }
              }}
              rows={3}
              className="min-h-24 w-full resize-y bg-transparent px-2 py-1 text-[14px] leading-relaxed text-foreground outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(message.content)
                  setEditing(false)
                }}
                className="rounded-full bg-background px-4 py-1.5 text-[13px] text-foreground ring-1 ring-border/70 transition hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={submitEdit}
                className="rounded-full bg-foreground px-4 py-1.5 text-[13px] text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "paper max-w-full whitespace-pre-wrap rounded-lg rounded-br-md bg-secondary/80 px-4 py-2.5 text-[14px] leading-relaxed text-secondary-foreground ring-1 transition",
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
        )}

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

        {!editing && (
          <div className="flex items-center gap-1 text-muted-foreground opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                navigator.clipboard?.writeText(message.content).catch(() => {})
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="复制"
              aria-label="复制"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setEditing(true)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="编辑"
              aria-label="编辑"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            {branchNavigation && branchNavigation.total > 1 && (
              <div className="ml-0.5 flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={!branchNavigation.previousTurnId}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (branchNavigation.previousTurnId) onSelectTurnBranch(branchNavigation.previousTurnId)
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-secondary hover:text-foreground disabled:opacity-35"
                  title="上一个版本"
                  aria-label="上一个版本"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-9 text-center text-[12px] font-medium text-foreground/80">
                  {branchNavigation.index}/{branchNavigation.total}
                </span>
                <button
                  type="button"
                  disabled={!branchNavigation.nextTurnId}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (branchNavigation.nextTurnId) onSelectTurnBranch(branchNavigation.nextTurnId)
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-secondary hover:text-foreground disabled:opacity-35"
                  title="下一个版本"
                  aria-label="下一个版本"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
