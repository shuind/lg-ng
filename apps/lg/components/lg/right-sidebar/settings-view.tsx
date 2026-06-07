"use client"

import { useState } from "react"
import {
  AtSign,
  Calendar,
  ChevronRight,
  CircleDot,
  Landmark,
  Layers,
  Library,
  MapPin,
  Network,
  Search,
  User,
  X,
} from "lucide-react"
import type { SettingCard } from "@/lib/types"
import { cn } from "@/lib/utils"

const SETTING_CATEGORY_ORDER: SettingCard["category"][] = [
  "character",
  "faction",
  "location",
  "mechanism",
  "formation",
  "event",
  "rule",
  "other",
]

export function SettingsView({ cards, onCite }: { cards: SettingCard[]; onCite: (c: SettingCard) => void }) {
  const [query, setQuery] = useState("")
  const [openGroups, setOpenGroups] = useState<Set<SettingCard["category"]>>(
    () => new Set(SETTING_CATEGORY_ORDER),
  )
  const [openCards, setOpenCards] = useState<Set<string>>(new Set())
  const [fullContentCards, setFullContentCards] = useState<Set<string>>(new Set())
  const normalizedQuery = query.trim().toLowerCase()
  const visibleCards = normalizedQuery
    ? cards.filter((card) => settingCardSearchText(card).includes(normalizedQuery))
    : cards

  const groupedCards = SETTING_CATEGORY_ORDER
    .map((category) => ({
      category,
      cards: visibleCards.filter((card) => card.category === category),
    }))
    .filter((group) => group.cards.length > 0)

  function toggleGroup(category: SettingCard["category"]) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  function toggleCard(cardId: string) {
    setOpenCards((current) => {
      const next = new Set(current)
      if (next.has(cardId)) {
        next.delete(cardId)
      } else {
        next.add(cardId)
      }
      return next
    })
  }

  function toggleFullContent(cardId: string) {
    setFullContentCards((current) => {
      const next = new Set(current)
      if (next.has(cardId)) {
        next.delete(cardId)
      } else {
        next.add(cardId)
      }
      return next
    })
  }

  if (cards.length === 0) {
    return <div className="mt-12 text-center text-[12px] text-muted-foreground/70">暂无设定卡。</div>
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索人物、地点、规则"
            className="w-full rounded-md border border-border/50 bg-background/45 py-1.5 pl-7 pr-7 text-[12px] outline-none placeholder:text-muted-foreground/55 focus:ring-1 focus:ring-ring/45"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 rounded p-1 text-muted-foreground/60 transition -translate-y-1/2 hover:bg-secondary hover:text-foreground"
              aria-label="清空设定卡搜索"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/75">设定索引</span>
          <span className="font-mono text-[10px]">
            {visibleCards.length}/{cards.length} 张
          </span>
        </div>
      </div>

      {groupedCards.length === 0 && (
        <div className="mt-10 text-center text-[12px] leading-relaxed text-muted-foreground/65">
          没有匹配的设定卡。
        </div>
      )}

      {groupedCards.map((group) => {
        const { Icon, label } = settingCategoryMeta(group.category)
        const groupOpen = normalizedQuery ? true : openGroups.has(group.category)
        return (
          <section key={group.category} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.category)}
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[12px] text-muted-foreground transition hover:bg-sidebar-accent/25 hover:text-foreground"
              aria-expanded={groupOpen}
            >
              <ChevronRight
                className={cn("h-3 w-3 shrink-0 transition", groupOpen && "rotate-90")}
              />
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground/85">{label}</span>
              <span className="font-mono text-[10px] text-muted-foreground/60">
                {group.cards.length}
              </span>
            </button>

            {groupOpen && (
              <div className="space-y-0.5">
                {group.cards.map((card) => {
                  const open = openCards.has(card.id)
                  const fullContent = fullContentCards.has(card.id)
                  const hasFullContent = Boolean(card.content && card.content.trim() && card.content.trim() !== card.summary.trim())
                  return (
                    <div key={card.id} className="group rounded-md transition hover:bg-sidebar-accent/25">
                      <div className="flex items-start gap-1.5 px-1 py-2">
                        <button
                          type="button"
                          onClick={() => toggleCard(card.id)}
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
                                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/55">
                                  {Object.keys(card.meta).length}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground/85">
                              {card.summary}
                            </p>
                            {card.path && (
                              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/45">
                                {card.path}
                              </div>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onCite(card)}
                          className="mt-0.5 rounded-md p-1 text-muted-foreground/65 transition hover:bg-secondary hover:text-foreground"
                          aria-label="引用到对话"
                          title="引用到对话"
                        >
                          <AtSign className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {open && (
                        <div className="ml-6 border-l border-border/35 px-3 pb-3 pt-1">
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
                              onClick={() => toggleFullContent(card.id)}
                              className="mt-2 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                            >
                              {fullContent ? "收起全文" : "展开全文"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function settingCategoryMeta(category: SettingCard["category"]) {
  switch (category) {
    case "character":
      return { Icon: User, label: "人物" }
    case "faction":
      return { Icon: Landmark, label: "势力" }
    case "location":
      return { Icon: MapPin, label: "地点" }
    case "mechanism":
      return { Icon: CircleDot, label: "世界机制" }
    case "formation":
      return { Icon: Network, label: "阵法" }
    case "event":
      return { Icon: Calendar, label: "事件" }
    case "rule":
      return { Icon: Layers, label: "规则" }
    case "other":
      return { Icon: Library, label: "其他" }
  }
}

function settingCardSearchText(card: SettingCard): string {
  const metaText = card.meta
    ? Object.entries(card.meta)
        .map(([key, value]) => `${key} ${value}`)
        .join(" ")
    : ""
  return [
    card.name,
    card.summary,
    card.content,
    card.path,
    settingCategoryMeta(card.category).label,
    metaText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}
