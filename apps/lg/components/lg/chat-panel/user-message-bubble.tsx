"use client"

import { useCallback } from "react"
import { Copy, Edit3 } from "lucide-react"
import type { Message } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export function UserMessageBubble({
  message,
  selected,
  isLatestUser,
  highlightedUser,
  registerUserMessage,
  onSelectTurn,
  onEditLatest,
}: {
  message: Message
  selected: boolean
  isLatestUser: boolean
  highlightedUser: boolean
  registerUserMessage: (turnId: string, element: HTMLDivElement | null) => void
  onSelectTurn: (turnId: string) => void
  onEditLatest: (content: string) => void
}) {
  const userMessageRef = useCallback((element: HTMLDivElement | null) => {
    registerUserMessage(message.turnId, element)
  }, [message.turnId, registerUserMessage])

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
