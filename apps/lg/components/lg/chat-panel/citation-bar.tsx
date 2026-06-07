"use client"

import { AtSign, XCircle } from "lucide-react"
import type { ChatCitation } from "./types"

export function CitationBar({
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
            {card.path && (
              <span className="hidden max-w-[160px] truncate font-mono text-muted-foreground sm:inline">
                {card.path}
              </span>
            )}
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
