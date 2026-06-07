"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Edit3, GitBranch, Loader2, Sparkles } from "lucide-react"
import type { Message, Turn } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "./markdown-content"
import { RunDetailsCard } from "./run-details-card"

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

export const ChatTranscript = memo(function ChatTranscript({
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
