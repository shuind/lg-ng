import {
  Calendar,
  CircleDot,
  Landmark,
  Layers,
  Library,
  MapPin,
  Network,
  User,
  type LucideIcon,
} from "lucide-react"
import type { SettingCard } from "@/lib/types"

export const SETTING_CATEGORY_ORDER: SettingCard["category"][] = [
  "character",
  "faction",
  "location",
  "mechanism",
  "formation",
  "event",
  "rule",
  "other",
]

export function settingCategoryMeta(category: SettingCard["category"]): { Icon: LucideIcon; label: string } {
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

export function settingCardSearchText(card: SettingCard): string {
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
