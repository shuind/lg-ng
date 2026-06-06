"use client"

import { useState } from "react"
import {
  AtSign,
  Calendar,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  Landmark,
  Layers,
  Library,
  MapPin,
  Network,
  Search,
  User,
  X,
} from "lucide-react"
import type { LedgerEntry, SettingCard } from "@/lib/types"
import { cn } from "@/lib/utils"

interface RightSidebarProps {
  cards: SettingCard[]
  ledgerEntries: LedgerEntry[]
  onCite: (card: SettingCard) => void
  onOpenFile: (path: string) => void
}

export function RightSidebar({
  cards,
  ledgerEntries,
  onCite,
  onOpenFile,
}: RightSidebarProps) {
  const [tab, setTab] = useState<"recent" | "settings">("recent")

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col bg-sidebar/80 paper-soft">
      <div className="shrink-0 px-4 pt-5 pb-3">
        <div className="flex items-center gap-1">
          <TabBtn active={tab === "recent"} onClick={() => setTab("recent")} icon={<Clock3 className="h-3.5 w-3.5" />}>
            最近改动
          </TabBtn>
          <TabBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<Library className="h-3.5 w-3.5" />}>
            设定卡
          </TabBtn>
        </div>
        <div className="mt-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-6">
        {tab === "recent" ? (
          <RecentChangesView entries={ledgerEntries} onOpenFile={onOpenFile} />
        ) : (
          <SettingsView cards={cards} onCite={onCite} />
        )}
      </div>
    </aside>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function RecentChangesView({
  entries,
  onOpenFile,
}: {
  entries: LedgerEntry[]
  onOpenFile: (path: string) => void
}) {
  const recentEntries = entries.slice(0, 24)
  const groups = buildRecentChangeGroups(recentEntries)
  const [dateGroupOpenOverrides, setDateGroupOpenOverrides] = useState<Record<string, boolean>>({})
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set())

  if (recentEntries.length === 0) {
    return (
      <div className="mt-14 text-center text-[12px] leading-relaxed text-muted-foreground/65">
        暂无改动记录。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const groupOpen = dateGroupOpenOverrides[group.key] ?? group.defaultOpen

        return (
          <section key={group.key} className="space-y-1">
            <button
              type="button"
              onClick={() =>
                setDateGroupOpenOverrides((current) => ({
                  ...current,
                  [group.key]: !groupOpen,
                }))
              }
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] text-muted-foreground transition hover:bg-sidebar-accent/25 hover:text-foreground"
              aria-expanded={groupOpen}
            >
              <ChevronRight
                className={cn("h-3 w-3 shrink-0 transition", groupOpen && "rotate-90")}
              />
              <span className="font-medium text-foreground/80">{group.label}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                {group.entryCount} 条 · {group.fileCount} 文件
              </span>
            </button>

            {groupOpen && (
              <div className="relative">
                <div className="absolute bottom-3 left-[7px] top-3 w-px bg-border/30" />
                {group.items.map((item) => {
                  const isBatch = item.files.length > 1
                  const batchExpanded = expandedBatchIds.has(item.id)

                  return (
                    <div key={item.id} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isBatch) {
                            onOpenFile(item.files[0]?.path ?? item.targetPath)
                            return
                          }
                          setExpandedBatchIds((current) => {
                            const next = new Set(current)
                            if (next.has(item.id)) {
                              next.delete(item.id)
                            } else {
                              next.add(item.id)
                            }
                            return next
                          })
                        }}
                        className="group relative flex w-full gap-3 rounded-md py-2 pl-5 pr-2 text-left transition hover:bg-sidebar-accent/25"
                        aria-expanded={isBatch ? batchExpanded : undefined}
                      >
                        <span className="absolute left-[4.5px] top-[16px] h-[7px] w-[7px] rounded-full border border-border/70 bg-sidebar shadow-[0_0_0_2px_var(--sidebar)] transition group-hover:border-foreground/35" />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="shrink-0">{item.actorLabel}</span>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <span className="shrink-0">{item.actionLabel}</span>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <span className="shrink-0">{item.files.length} 个文件</span>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <span className="shrink-0 font-mono">{formatChangeTime(item.timestamp)}</span>
                            {isBatch && (
                              <ChevronRight
                                className={cn(
                                  "ml-auto h-3 w-3 shrink-0 text-muted-foreground/55 transition",
                                  batchExpanded && "rotate-90",
                                )}
                              />
                            )}
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-foreground/90">
                            {item.summary}
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/55 transition group-hover:text-muted-foreground/75">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">
                              {formatFilePreview(item.files)}
                            </span>
                          </span>
                        </span>
                      </button>

                      {isBatch && batchExpanded && (
                        <div className="ml-5 space-y-0.5 pb-1 pr-1">
                          {item.files.map((file) => (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => onOpenFile(file.path)}
                              className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground/70 transition hover:bg-sidebar-accent/30 hover:text-foreground"
                            >
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{file.path}</span>
                            </button>
                          ))}
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

type RecentChangeFile = {
  path: string
  name: string
}

type NormalizedRecentChange = {
  id: string
  actor: LedgerEntry["actor"]
  actorLabel: string
  actionKey: string
  actionLabel: string
  timestamp: string
  timestampMs: number
  minuteKey: string
  dayKey: string
  dayLabel: string
  defaultOpen: boolean
  targetPath: string
  summary: string
  file: RecentChangeFile
}

type RecentChangeItem = {
  id: string
  actor: LedgerEntry["actor"]
  actorLabel: string
  actionKey: string
  actionLabel: string
  timestamp: string
  timestampMs: number
  minuteKey: string
  targetPath: string
  summary: string
  summaries: string[]
  files: RecentChangeFile[]
  entryCount: number
}

type RecentChangeGroup = {
  key: string
  label: string
  defaultOpen: boolean
  items: RecentChangeItem[]
  entryCount: number
  fileCount: number
}

function buildRecentChangeGroups(entries: LedgerEntry[]): RecentChangeGroup[] {
  const groups: RecentChangeGroup[] = []
  const groupByKey = new Map<string, RecentChangeGroup>()

  for (const entry of entries) {
    const normalized = normalizeRecentChange(entry)
    let group = groupByKey.get(normalized.dayKey)
    if (!group) {
      group = {
        key: normalized.dayKey,
        label: normalized.dayLabel,
        defaultOpen: normalized.defaultOpen,
        items: [],
        entryCount: 0,
        fileCount: 0,
      }
      groupByKey.set(normalized.dayKey, group)
      groups.push(group)
    }

    const previous = group.items[group.items.length - 1]
    if (previous && canMergeRecentChange(previous, normalized)) {
      mergeRecentChange(previous, normalized)
    } else {
      group.items.push(createRecentChangeItem(normalized))
    }
  }

  return groups.map((group) => {
    const uniqueFiles = new Set<string>()
    let entryCount = 0
    for (const item of group.items) {
      entryCount += item.entryCount
      for (const file of item.files) {
        uniqueFiles.add(normalizePathKey(file.path))
      }
    }
    return {
      ...group,
      entryCount,
      fileCount: uniqueFiles.size,
    }
  })
}

function normalizeRecentChange(entry: LedgerEntry): NormalizedRecentChange {
  const timestamp = entryTimestamp(entry)
  const date = new Date(timestamp)
  const targetPath = entry.targetPath || ""
  const action = displayAction(entry)
  const dayMeta = formatDateGroupMeta(timestamp)
  const file = {
    path: targetPath,
    name: fileNameFromPath(targetPath),
  }

  return {
    id: entry.id,
    actor: entry.actor,
    actorLabel: actorLabel(entry.actor),
    actionKey: action.key,
    actionLabel: action.label,
    timestamp,
    timestampMs: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
    minuteKey: formatMinuteKey(timestamp),
    dayKey: dayMeta.key,
    dayLabel: dayMeta.label,
    defaultOpen: dayMeta.defaultOpen,
    targetPath,
    summary: displaySummary(entry, action.label, file.name),
    file,
  }
}

function createRecentChangeItem(change: NormalizedRecentChange): RecentChangeItem {
  return {
    id: change.id,
    actor: change.actor,
    actorLabel: change.actorLabel,
    actionKey: change.actionKey,
    actionLabel: change.actionLabel,
    timestamp: change.timestamp,
    timestampMs: change.timestampMs,
    minuteKey: change.minuteKey,
    targetPath: change.targetPath,
    summary: change.summary,
    summaries: [change.summary],
    files: [change.file],
    entryCount: 1,
  }
}

function canMergeRecentChange(item: RecentChangeItem, change: NormalizedRecentChange): boolean {
  return (
    item.actor === change.actor &&
    item.actionKey === change.actionKey &&
    item.minuteKey === change.minuteKey
  )
}

function mergeRecentChange(item: RecentChangeItem, change: NormalizedRecentChange) {
  item.entryCount += 1
  item.timestamp = item.timestampMs >= change.timestampMs ? item.timestamp : change.timestamp
  item.timestampMs = Math.max(item.timestampMs, change.timestampMs)
  item.summaries.push(change.summary)

  if (!item.files.some((file) => normalizePathKey(file.path) === normalizePathKey(change.file.path))) {
    item.files.push(change.file)
  }

  item.summary =
    item.files.length > 1
      ? `批量${item.actionLabel}：${item.files
          .slice(0, 2)
          .map((file) => file.name)
          .join("、")}${item.files.length > 2 ? ` 等 ${item.files.length} 个文件` : ""}`
      : item.summaries[0] ?? change.summary
}

function entryTimestamp(entry: LedgerEntry): string {
  return entry.timestamp || (entry as LedgerEntry & { ts?: string }).ts || ""
}

function actorLabel(actor: LedgerEntry["actor"]): string {
  return actor === "agent" ? "AI" : "用户"
}

function displayAction(entry: LedgerEntry): { key: string; label: string } {
  const action = entry.action.toLowerCase()
  const summary = entry.summary.trim()

  if (/^手动保存\s+/.test(summary)) return { key: "manual_save", label: "保存" }

  switch (action) {
    case "edit_file":
      return { key: "edit_file", label: "编辑" }
    case "write_file":
      return { key: "write_file", label: "写入" }
    case "rollback_file":
      return { key: "rollback_file", label: "恢复" }
    case "repair_outline_write":
      return { key: "repair_outline_write", label: "修复大纲" }
    default:
      if (action.includes("repair") && action.includes("outline")) {
        return { key: "repair_outline", label: "修复大纲" }
      }
      if (action.includes("rollback")) return { key: "rollback_file", label: "恢复" }
      if (action.includes("edit")) return { key: "edit_file", label: "编辑" }
      if (action.includes("write")) return { key: "write_file", label: "写入" }
      return { key: action || "update", label: "更新" }
  }
}

function displaySummary(entry: LedgerEntry, actionLabel: string, fileName: string): string {
  const summary = entry.summary.trim()

  if (/^手动保存\s+/.test(summary)) {
    return `保存 ${fileName}`
  }

  if (
    entry.action === "repair_outline_write" ||
    /repair\s+bad\s+outline\s+write/i.test(summary)
  ) {
    return "修复大纲写入"
  }

  if (!summary || isTechnicalSummary(summary)) {
    return `${actionLabel} ${fileName}`
  }

  return summary
}

function isTechnicalSummary(summary: string): boolean {
  if (!/^[\x00-\x7F]+$/.test(summary)) return false
  return /\b(write_file|edit_file|rollback_file|repair_outline_write|outline|ledger|dirty|snapshot)\b/i.test(
    summary,
  )
}

function formatFilePreview(files: RecentChangeFile[]): string {
  if (files.length === 0) return "未指定文件"
  if (files.length === 1) return files[0].path
  return `${files
    .slice(0, 2)
    .map((file) => file.name)
    .join("、")}${files.length > 2 ? ` 等 ${files.length} 个文件` : ""}`
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).pop() || path || "未命名文件"
}

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").trim().toLowerCase()
}

function formatDateGroupMeta(iso: string): { key: string; label: string; defaultOpen: boolean } {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return { key: "unknown", label: "较早", defaultOpen: false }
  }

  const today = new Date()
  const startOfToday = startOfLocalDay(today).getTime()
  const startOfDate = startOfLocalDay(date).getTime()
  const dayDiff = Math.floor((startOfToday - startOfDate) / 86400000)
  const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

  if (dayDiff === 0) return { key, label: "今天", defaultOpen: true }
  if (dayDiff === 1) return { key, label: "昨天", defaultOpen: false }
  return {
    key,
    label: `${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日`,
    defaultOpen: false,
  }
}

function formatMinuteKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatChangeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "未知"

  const diff = Date.now() - date.getTime()
  if (diff >= 0 && diff < 7 * 86400000) {
    return formatRelativeTime(iso)
  }

  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return "未知"
  const diff = Date.now() - time
  if (diff < 0) return "刚刚"
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const date = new Date(iso)
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`
}

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

function SettingsView({ cards, onCite }: { cards: SettingCard[]; onCite: (c: SettingCard) => void }) {
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
