"use client"

import { AtSign, ChevronRight } from "lucide-react"
import type { SettingCard } from "@/lib/types"
import { cn } from "@/lib/utils"

export function SettingCardItem({
  card,
  open,
  fullContent,
  onToggle,
  onToggleFullContent,
  onCite,
}: {
  card: SettingCard
  open: boolean
  fullContent: boolean
  onToggle: () => void
  onToggleFullContent: () => void
  onCite: (card: SettingCard) => void
}) {
  const hasFullContent = Boolean(card.content && card.content.trim() && card.content.trim() !== card.summary.trim())

  return (
    <div className="group rounded-lg transition hover:bg-sidebar-accent/15 focus-within:bg-sidebar-accent/15">
      <div className="flex items-start gap-1.5 px-2 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronRight
            className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition", open && "rotate-90")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-serif text-[13.5px] text-foreground">
                {card.name}
              </span>
              {card.meta && Object.keys(card.meta).length > 0 && (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/45">
                  {Object.keys(card.meta).length}
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground/75">
              {card.summary}
            </p>
            {card.path && (
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/35">
                {card.path}
              </div>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onCite(card)}
          className="mt-0.5 rounded-md p-1 text-muted-foreground/55 transition hover:bg-sidebar-accent hover:text-foreground"
          aria-label="引用到对话"
          title="引用到对话"
        >
          <AtSign className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="ml-7 border-l border-border/25 px-3 pb-3 pt-1">
          {fullContent && card.content ? (
            <pre className="max-h-[42vh] whitespace-pre-wrap break-words overflow-y-auto font-serif text-[12px] leading-relaxed text-foreground/85 scrollbar-thin">
              {card.content}
            </pre>
          ) : (
            <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/82">
              {card.summary}
            </p>
          )}
          {card.meta && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(card.meta).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded bg-muted/35 px-1.5 py-0.5 text-[10px] text-muted-foreground/85 ring-1 ring-border/30"
                >
                  <span className="opacity-60">{key}</span>
                  <span className="ml-1 text-foreground/80">{value}</span>
                </span>
              ))}
            </div>
          )}
          {hasFullContent && (
            <button
              type="button"
              onClick={onToggleFullContent}
              className="mt-2 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {fullContent ? "收起全文" : "展开全文"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
