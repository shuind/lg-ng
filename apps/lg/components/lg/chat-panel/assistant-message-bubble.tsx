"use client"

import { useEffect, useRef, useState } from "react"
import { Check, CheckCheck, ChevronDown, Copy, ExternalLink, GitBranch, MessageCircleQuestionMark, Sparkles, Trash2, Undo2 } from "lucide-react"
import { useWorkbenchOpen } from "@/components/lg/workbench-open-context"
import type { AgentEvent, Message } from "@/lib/types"
import type { ProposalSummary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ActivityIndicator } from "./activity-indicator"
import { DiffBlock } from "./diff-block"
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
  const workbench = useWorkbenchOpen()
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
  const askUserQuestions = isAssistant
    ? extractAskUserQuestions(message.events ?? [], message.content)
    : []

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
        "group relative flex flex-col gap-3 rounded-lg px-2 py-1 transition",
        isAssistant && "pr-10",
        selected && "surface-2 ring-1 ring-border/70",
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
      {streaming && (message.events ?? []).length > 0 && (
        <ActivityIndicator events={message.events ?? []} streaming={streaming} />
      )}
      {reasoningText && <ReasoningTrace text={reasoningText} streaming={reasoningStreaming} />}
      {askUserQuestions.length > 0 && <AskUserQuestionCard questions={askUserQuestions} />}
      {message.content.trim()
        ? contentStreaming
          ? <StreamingPlainText content={message.content} />
          : <MarkdownContent content={message.content} />
        : reasoningStreaming && (message.events ?? []).length === 0
          ? <ActivityIndicator events={message.events ?? []} streaming />
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
        <div className="mt-1 space-y-2">
          {message.changeSet.entries.map((entry) => (
            <div key={entry.id} onClick={(event) => event.stopPropagation()}>
              <DiffBlock
                title={entry.targetPath}
                subtitle={entry.summary}
                patch={entry.diffPatch}
                emptyMessage={entry.diffOmitted ? "diff 过大，完整内容已保留在 Ledger。" : "本次改动没有可预览 diff。"}
                action={(
                  <div className="flex shrink-0 items-center gap-1">
                    {entry.diffOmitted && (
                      <button
                        type="button"
                        disabled={!workbench}
                        onClick={() => workbench?.openLedger(entry.id, entry.targetPath)}
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ledger
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!workbench}
                      onClick={() => workbench?.openPath(entry.targetPath)}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      文件
                    </button>
                    {entry.rollbackable && (
                      <button
                        type="button"
                        onClick={() => void onRollbackLedgerEntry(entry.id)}
                        disabled={rollingBackLedgerEntryId === entry.id}
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
                        title="撤销"
                        aria-label="撤销"
                      >
                        <Undo2 className="h-3 w-3" />
                        撤销
                      </button>
                    )}
                  </div>
                )}
              />
            </div>
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
              className="surface-2 rounded-md border px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
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

function ReasoningTrace({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <details
      open={streaming}
      className={cn(
        "surface-2 group rounded-lg border border-l-2 text-[12px] text-muted-foreground transition",
        streaming ? "border-l-accent" : "border-l-border",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <Sparkles className={cn("h-3.5 w-3.5 shrink-0", streaming ? "animate-pulse text-accent-foreground" : "opacity-70")} />
        <span className="font-medium text-foreground/80">{streaming ? "正在思考" : "思考流"}</span>
        <span className="min-w-0 flex-1 truncate">{summarizeReasoning(text)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
      </summary>
      <div className="border-t hairline px-3 py-2">
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed text-foreground/80">
          {text}{streaming && <span className="animate-pulse">▍</span>}
        </pre>
      </div>
    </details>
  )
}

function StreamingPlainText({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap break-words font-serif text-[15.5px] leading-[1.8] text-foreground">
      {content}
      <span className="animate-pulse">▍</span>
    </div>
  )
}

function summarizeReasoning(text: string): string {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  return firstLine ? firstLine.slice(0, 80) : "模型正在整理推理过程"
}

function AskUserQuestionCard({ questions }: { questions: string[] }) {
  return (
    <div className="surface-2 rounded-lg border border-accent/40 px-3 py-2.5 text-[13px] shadow-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-foreground/85">
        <MessageCircleQuestionMark className="h-3.5 w-3.5 shrink-0 text-accent-foreground" />
        <span>需要你确认</span>
      </div>
      <div className="space-y-3">
        {questions.map((question, index) => (
          <div key={`${index}:${question.slice(0, 32)}`} className="whitespace-pre-wrap break-words font-serif text-[14.5px] leading-[1.75] text-foreground">
            {question}
          </div>
        ))}
      </div>
    </div>
  )
}

function extractAskUserQuestions(events: AgentEvent[], content: string): string[] {
  const seen = new Set<string>()
  const questions: string[] = []

  for (const event of events) {
    if (event.name !== "ask_user" && event.text !== "ask_user") continue
    const question = parseAskUserArgs(event.argsPreview) ?? parseAskUserResult(event.resultPreview)
    if (!question) continue

    const normalized = normalizeQuestion(question)
    if (!normalized || seen.has(normalized) || contentAlreadyShowsQuestion(content, question)) continue
    seen.add(normalized)
    questions.push(question)
  }

  return questions
}

function parseAskUserArgs(value?: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const withoutEllipsis = trimmed.endsWith("...") ? trimmed.slice(0, -3) : trimmed
  try {
    const parsed = JSON.parse(withoutEllipsis) as unknown
    if (parsed && typeof parsed === "object" && "question" in parsed) {
      const question = (parsed as { question?: unknown }).question
      return typeof question === "string" ? question.trim() : null
    }
  } catch {
    // Recover below when a preview contains extra text around the JSON.
  }

  const match = trimmed.match(/"question"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (!match?.[1]) return null
  try {
    return JSON.parse(`"${match[1]}"`).trim()
  } catch {
    return match[1].replace(/\\n/g, "\n").replace(/\\"/g, "\"").trim()
  }
}

function parseAskUserResult(value?: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const marker = "Question for user:"
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex < 0) return null

  let question = trimmed.slice(markerIndex + marker.length).trim()
  const footerIndex = [
    "The CLI will show",
    "Present this question to the user",
  ].map((footer) => question.indexOf(footer)).filter((index) => index >= 0).sort((a, b) => a - b)[0]
  if (footerIndex !== undefined) question = question.slice(0, footerIndex).trim()
  return question || null
}

function contentAlreadyShowsQuestion(content: string, question: string): boolean {
  const normalizedContent = normalizeQuestion(content)
  const normalizedQuestion = normalizeQuestion(question)
  if (!normalizedContent || !normalizedQuestion) return false
  const probeLength = Math.min(80, normalizedQuestion.length)
  return normalizedContent.includes(normalizedQuestion.slice(0, probeLength))
}

function normalizeQuestion(value: string): string {
  return value.replace(/\s+/g, " ").trim()
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
    <details open className="surface-1 rounded-lg border text-[12px]" onClick={(event) => event.stopPropagation()}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/85">
          {proposal.targetPath}
        </span>
        <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
          {proposal.status}
        </span>
      </summary>
      <div className="space-y-2 border-t hairline px-3 py-2">
        <div className="text-[11px] text-muted-foreground">{proposal.summary}</div>
        <div className="space-y-1.5">
          {proposal.hunks.map((hunk) => (
            <label key={hunk.id} className="surface-3 flex gap-2 rounded-md border p-2">
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
        {proposal.diffPatch && <DiffBlock patch={proposal.diffPatch} maxHeightClass="max-h-64" />}
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
