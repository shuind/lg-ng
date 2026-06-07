"use client"

import { ChevronRight } from "lucide-react"
import type { SettingCard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SettingCardItem } from "./setting-card-item"
import { settingCategoryMeta } from "./settings-meta"

export function SettingCardGroup({
  category,
  cards,
  open,
  openCards,
  fullContentCards,
  onToggleGroup,
  onToggleCard,
  onToggleFullContent,
  onCite,
}: {
  category: SettingCard["category"]
  cards: SettingCard[]
  open: boolean
  openCards: Set<string>
  fullContentCards: Set<string>
  onToggleGroup: () => void
  onToggleCard: (cardId: string) => void
  onToggleFullContent: (cardId: string) => void
  onCite: (card: SettingCard) => void
}) {
  const { Icon, label } = settingCategoryMeta(category)

  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={onToggleGroup}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[12px] text-muted-foreground transition hover:bg-sidebar-accent/25 hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition", open && "rotate-90")} />
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/85">{label}</span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {cards.length}
        </span>
      </button>

      {open && (
        <div className="space-y-0.5">
          {cards.map((card) => (
            <SettingCardItem
              key={card.id}
              card={card}
              open={openCards.has(card.id)}
              fullContent={fullContentCards.has(card.id)}
              onToggle={() => onToggleCard(card.id)}
              onToggleFullContent={() => onToggleFullContent(card.id)}
              onCite={onCite}
            />
          ))}
        </div>
      )}
    </section>
  )
}
