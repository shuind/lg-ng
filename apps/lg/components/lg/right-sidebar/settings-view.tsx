"use client"

import { useState } from "react"
import { Library, SearchX } from "lucide-react"
import type { SettingCard } from "@/lib/types"
import { SettingCardGroup } from "./setting-card-group"
import { SETTING_CATEGORY_ORDER, settingCardSearchText } from "./settings-meta"
import { SettingsSearch } from "./settings-search"
import { PanelEmpty } from "./panel-empty"

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
    return (
      <PanelEmpty
        icon={Library}
        title="暂无设定卡"
        description="人物、地点与世界规则会在这里汇成可检索的设定索引，随时引用到对话。"
      />
    )
  }

  return (
    <div className="space-y-3">
      <SettingsSearch
        query={query}
        visibleCount={visibleCards.length}
        totalCount={cards.length}
        onQueryChange={setQuery}
      />

      {groupedCards.length === 0 && (
        <PanelEmpty
          icon={SearchX}
          title="没有匹配的设定卡"
          description="换个关键词试试，或清空搜索查看全部设定。"
        />
      )}

      {groupedCards.map((group) => (
        <SettingCardGroup
          key={group.category}
          category={group.category}
          cards={group.cards}
          open={normalizedQuery ? true : openGroups.has(group.category)}
          openCards={openCards}
          fullContentCards={fullContentCards}
          onToggleGroup={() => toggleGroup(group.category)}
          onToggleCard={toggleCard}
          onToggleFullContent={toggleFullContent}
          onCite={onCite}
        />
      ))}
    </div>
  )
}
