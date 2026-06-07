"use client"

import { useState } from "react"
import { Check, Search } from "lucide-react"
import type { SettingCard } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import type { ChatCitation } from "./types"

export function ReferencePicker({
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
