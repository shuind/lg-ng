"use client"

import { useEffect, useRef, useState } from "react"
import { Check, CheckCheck, ChevronDown, Copy, GitBranch, Loader2, Sparkles, Trash2, Undo2 } from "lucide-react"
import type { Message } from "@/lib/mock-data"
import type { ProposalSummary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "./markdown-content"
import { RunDetailsCard } from "./run-details-card"

export function AssistantMessageBubble({
  message,
  selected,
  streaming = false,
  onSelectTurn,
  onForkThread,
  rollingBackLedgerEntryId,
  applyingProposalId,
  onRollbackLedgerEntry,
  onApplyProposal,
  onDiscardProposal,
}: {
  message: Message
  selected: boolean
  streaming?: boolean
  onSelectTurn: (turnId: string) => void
  onForkThread: (turnId: string) => void
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  onRollbackLedgerEntry: (entryId: string) => Promise<void>
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
}) {
  const [assistantCopied, setAssistantCopied] = useState(false)
  const copyResetRef = useRef<number | null>(null)
  const isAssistant = message.role === "assistant"
  const reasoningText = isAssistant
    ? (message.events ?? [])
      .filter((event) => event.type === "reasoning" && event.text)
      .map((event) => event.text)
      .join("")
      .trim()
    : ""
  // While streaming, the model is "thinking out loud" before any answer text
  // arrives. Treat reasoning as live until the answer body starts.
  const reasoningStreaming = streaming && message.content.trim().length === 0
  const contentStreaming = streaming && message.content.trim().length > 0

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
      {reasoningText && <ReasoningTrace text={reasoningText} streaming={reasoningStreaming} />}
      {message.content.trim()
        ? <MarkdownContent content={contentStreaming ? `${message.content}▍` : message.content} />
        : reasoningStreaming
          ? <ThinkingHint />
          : null}

      {message.proposalSet?.proposals && message.proposalSet.proposals.length > 0 && (
        <div className="mt-2 space-y-2">
          {message.proposalSet.proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              applying={applyingProposalId === proposal.id}
              onApplyProposal={onApplyProposal}
              onDiscardProposal={onDiscardProposal}
            />
          ))}
        </div>
      )}

      {message.changeSet?.entries && message.changeSet.entries.length > 0 && (
        <div className="mt-2 space-y-2">
          {message.changeSet.entries.map((entry) => (
            <details
              key={entry.id}
              className="rounded-lg border border-border/60 bg-muted/20 text-[12px]"
              onClick={(event) => event.stopPropagation()}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/85">
                  {entry.targetPath}
                </span>
                {entry.rollbackable && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void onRollbackLedgerEntry(entry.id)
                    }}
                    disabled={rollingBackLedgerEntryId === entry.id}
                    className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    title="撤销"
                    aria-label="撤销"
                  >
                    <Undo2 className="h-3 w-3" />
                    撤销
                  </button>
                )}
              </summary>
              <div className="border-t border-border/50 px-3 py-2">
                <div className="mb-2 text-[11px] text-muted-foreground">{entry.summary}</div>
                {entry.diffPatch ? (
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-background/70 p-3 font-mono text-[10.5px] leading-relaxed text-foreground/85">
                    {entry.diffPatch}
                  </pre>
                ) : (
                  <div className="rounded-md bg-background/70 p-3 text-[11px] text-muted-foreground">
                    diff 过大，已保留在 Ledger。
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

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

function ThinkingHint() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
      <span>正在思考…</span>
    </div>
  )
}

function ReasoningTrace({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <details
      open={streaming}
      className={cn(
        "group rounded-lg border bg-muted/20 text-[12px] text-muted-foreground transition",
        streaming ? "border-accent/40" : "border-border/50",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <Sparkles className={cn("h-3.5 w-3.5 shrink-0", streaming ? "animate-pulse text-accent-foreground" : "opacity-70")} />
        <span className="font-medium text-foreground/80">{streaming ? "正在思考" : "思考流"}</span>
        <span className="min-w-0 flex-1 truncate">{summarizeReasoning(text)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/40 px-3 py-2">
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed text-foreground/80">
          {text}{streaming && <span className="animate-pulse">▍</span>}
        </pre>
      </div>
    </details>
  )
}

function summarizeReasoning(text: string): string {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  return firstLine ? firstLine.slice(0, 80) : "模型正在整理推理过程"
}

function ProposalCard({
  proposal,
  applying,
  onApplyProposal,
  onDiscardProposal,
}: {
  proposal: ProposalSummary
  applying: boolean
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
}) {
  const [selected, setSelected] = useState(() => new Set(proposal.hunks.map((hunk) => hunk.id)))
  const pending = proposal.status === "pending"
  const selectedIds = [...selected]

  function toggleHunk(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <details className="rounded-lg border border-border/60 bg-muted/20 text-[12px]" onClick={(event) => event.stopPropagation()}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/85">
          {proposal.targetPath}
        </span>
        <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
          {proposal.status}
        </span>
      </summary>
      <div className="space-y-2 border-t border-border/50 px-3 py-2">
        <div className="text-[11px] text-muted-foreground">{proposal.summary}</div>
        <div className="space-y-1.5">
          {proposal.hunks.map((hunk) => (
            <label key={hunk.id} className="flex gap-2 rounded-md bg-background/60 p-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selected.has(hunk.id)}
                disabled={!pending || applying}
                onChange={() => toggleHunk(hunk.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="font-mono text-[10.5px] text-foreground/75">
                  {hunk.id} @ {hunk.baseStartLine}
                </span>
                <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {hunk.preview}
                </span>
              </span>
            </label>
          ))}
        </div>
        {proposal.diffPatch && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background/70 p-3 font-mono text-[10.5px] leading-relaxed text-foreground/85">
            {proposal.diffPatch}
          </pre>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!pending || applying || selectedIds.length === 0}
            onClick={() => void onApplyProposal(proposal.id, selectedIds)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground px-2 text-[11px] text-background transition hover:opacity-90 disabled:opacity-45"
          >
            <Check className="h-3 w-3" />
            采纳所选
          </button>
          <button
            type="button"
            disabled={!pending || applying}
            onClick={() => void onApplyProposal(proposal.id)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-45"
          >
            <CheckCheck className="h-3 w-3" />
            全部采纳
          </button>
          <button
            type="button"
            disabled={!pending || applying}
            onClick={() => void onDiscardProposal(proposal.id)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-destructive disabled:opacity-45"
          >
            <Trash2 className="h-3 w-3" />
            丢弃
          </button>
        </div>
      </div>
    </details>
  )
}
