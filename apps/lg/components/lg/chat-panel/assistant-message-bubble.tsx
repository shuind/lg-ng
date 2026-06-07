"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, GitBranch, Sparkles } from "lucide-react"
import type { Message } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "./markdown-content"
import { RunDetailsCard } from "./run-details-card"

export function AssistantMessageBubble({
  message,
  selected,
  onSelectTurn,
  onForkThread,
}: {
  message: Message
  selected: boolean
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
}) {
  const [assistantCopied, setAssistantCopied] = useState(false)
  const copyResetRef = useRef<number | null>(null)
  const isAssistant = message.role === "assistant"

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
}
