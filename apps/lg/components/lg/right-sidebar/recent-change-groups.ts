import type { LedgerEntry } from "@/lib/types"
import type {
  NormalizedRecentChange,
  RecentChangeFile,
  RecentChangeGroup,
  RecentChangeItem,
  RecentChangeRegion,
  RecentChangeRegionKey,
} from "./recent-change-types"
import { normalizePathKey, normalizeRecentChange } from "./recent-change-normalize"

const DEFAULT_ACTION_GROUP_LIMIT = 8
const AGENT_ACTION_WINDOW_MS = 15000
const REGION_ORDER: RecentChangeRegionKey[] = ["body", "draft", "status", "outline", "setting", "other"]

export function buildRecentChangeGroups(
  entries: LedgerEntry[],
  options: { itemLimit?: number } = {},
): RecentChangeGroup[] {
  const itemLimit = options.itemLimit ?? DEFAULT_ACTION_GROUP_LIMIT
  const items = selectVisibleItems(buildRecentChangeItems(entries), itemLimit)
  return groupItemsByDay(items)
}

function buildRecentChangeItems(entries: LedgerEntry[]): RecentChangeItem[] {
  const changes = entries
    .map((entry, index) => ({ change: normalizeRecentChange(entry), index }))
    .sort((left, right) => {
      const timeDiff = right.change.timestampMs - left.change.timestampMs
      return timeDiff || left.index - right.index
    })

  const items: RecentChangeItem[] = []

  for (const { change } of changes) {
    const previous = items[items.length - 1]
    if (previous && canMergeRecentChange(previous, change)) {
      mergeRecentChange(previous, change)
    } else {
      items.push(createRecentChangeItem(change))
    }
  }

  return items
}

function selectVisibleItems(items: RecentChangeItem[], limit: number): RecentChangeItem[] {
  if (items.length <= limit) return items

  const selectedIds = new Set(items.slice(0, limit).map((item) => item.id))
  const latestDayKey = items[0]?.dayKey

  for (const item of items) {
    if (selectedIds.has(item.id)) continue
    if (!latestDayKey || item.dayKey !== latestDayKey) continue
    if (!isHighValueItem(item)) continue

    selectedIds.add(item.id)
    trimSelectedItems(selectedIds, items, limit, item.id)
  }

  return items.filter((item) => selectedIds.has(item.id))
}

function trimSelectedItems(
  selectedIds: Set<string>,
  items: RecentChangeItem[],
  limit: number,
  protectedItemId: string,
) {
  while (selectedIds.size > limit) {
    const removable =
      [...items].reverse().find((item) => selectedIds.has(item.id) && item.lowPriority && item.id !== protectedItemId) ??
      [...items].reverse().find((item) => selectedIds.has(item.id) && !isHighValueItem(item) && item.id !== protectedItemId) ??
      [...items].reverse().find((item) => selectedIds.has(item.id) && item.id !== protectedItemId)

    if (!removable) {
      selectedIds.delete(protectedItemId)
      return
    }

    selectedIds.delete(removable.id)
  }
}

function groupItemsByDay(items: RecentChangeItem[]): RecentChangeGroup[] {
  const groups: RecentChangeGroup[] = []
  const groupByKey = new Map<string, RecentChangeGroup>()

  for (const item of items) {
    let group = groupByKey.get(item.dayKey)
    if (!group) {
      group = {
        key: item.dayKey,
        label: item.dayLabel,
        defaultOpen: item.defaultOpen,
        items: [],
        entryCount: 0,
        fileCount: 0,
      }
      groupByKey.set(item.dayKey, group)
      groups.push(group)
    }

    group.items.push(item)
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

function createRecentChangeItem(change: NormalizedRecentChange): RecentChangeItem {
  const item: RecentChangeItem = {
    id: change.id,
    actor: change.actor,
    actorLabel: change.actorLabel,
    actionKey: itemActionKey(change),
    actionLabel: itemActionLabel(change),
    actionKind: change.actionKind,
    timestamp: change.timestamp,
    timestampMs: change.timestampMs,
    oldestTimestampMs: change.timestampMs,
    minuteKey: change.minuteKey,
    dayKey: change.dayKey,
    dayLabel: change.dayLabel,
    defaultOpen: change.defaultOpen,
    targetPath: change.targetPath,
    summary: change.summary,
    summaries: [change.summary],
    regions: [change.region],
    files: [change.file],
    entries: [change.entry],
    entryCount: 1,
    hasBodyRisk: change.hasBodyRisk,
    lowPriority: change.actionKind === "manual_save",
  }
  item.summary = formatItemSummary(item)
  return item
}

function canMergeRecentChange(item: RecentChangeItem, change: NormalizedRecentChange): boolean {
  if (item.dayKey !== change.dayKey) return false
  if (item.actionKind === "rollback" || change.actionKind === "rollback") return false

  if (item.actionKind === "agent_action" && change.actionKind === "agent_action") {
    return Math.abs(item.oldestTimestampMs - change.timestampMs) <= AGENT_ACTION_WINDOW_MS
  }

  if (item.actionKind === "manual_save" && change.actionKind === "manual_save") {
    return item.minuteKey === change.minuteKey
  }

  return item.actor === change.actor && item.actionKey === change.actionKey && item.minuteKey === change.minuteKey
}

function mergeRecentChange(item: RecentChangeItem, change: NormalizedRecentChange) {
  item.entryCount += 1
  item.timestamp = item.timestampMs >= change.timestampMs ? item.timestamp : change.timestamp
  item.timestampMs = Math.max(item.timestampMs, change.timestampMs)
  item.oldestTimestampMs = Math.min(item.oldestTimestampMs, change.timestampMs)
  item.summaries.push(change.summary)
  item.entries.push(change.entry)
  item.hasBodyRisk = item.hasBodyRisk || change.hasBodyRisk

  if (!item.files.some((file) => normalizePathKey(file.path) === normalizePathKey(change.file.path))) {
    item.files.push(change.file)
  }
  item.regions = buildRegions(item.files)
  item.actionLabel = itemActionLabel(change, item)

  item.summary = formatItemSummary(item)
}

function itemActionKey(change: NormalizedRecentChange): string {
  return change.actionKind === "agent_action" ? "agent_action" : change.actionKey
}

function itemActionLabel(change: NormalizedRecentChange, item?: RecentChangeItem): string {
  const actionKind = item?.actionKind ?? change.actionKind
  if (actionKind === "agent_action") return "AI 行动"
  if (actionKind === "manual_save") return "手动保存"
  if (actionKind === "rollback") return "回滚"
  return change.actionLabel
}

function isHighValueItem(item: RecentChangeItem): boolean {
  return item.actionKind === "agent_action" || item.actionKind === "rollback"
}

function buildRegions(files: RecentChangeFile[]): RecentChangeRegion[] {
  const counts = new Map<RecentChangeRegionKey, number>()
  for (const file of files) {
    counts.set(file.region, (counts.get(file.region) ?? 0) + 1)
  }

  return REGION_ORDER.flatMap((key) => {
    const count = counts.get(key)
    return count ? [{ key, label: regionLabel(key), count }] : []
  })
}

function regionLabel(key: RecentChangeRegionKey): string {
  switch (key) {
    case "body":
      return "正文"
    case "draft":
      return "草稿"
    case "status":
      return "状态追踪"
    case "outline":
      return "大纲"
    case "setting":
      return "设定"
    default:
      return "其他"
  }
}

function formatItemSummary(item: RecentChangeItem): string {
  if (item.files.length === 0) return item.summary
  if (item.actionKind === "rollback") return `回滚 ${formatFileNames(item.files)}`
  if (item.actionKind === "manual_save") return `保存 ${formatFileNames(item.files)}`

  const parts = REGION_ORDER.flatMap((region) => {
    const files = item.files.filter((file) => file.region === region)
    return files.length ? [`${regionLabel(region)}：${formatFileNames(files)}`] : []
  })

  if (item.actionKind === "agent_action") {
    return parts.length > 0 ? parts.slice(0, 2).join(" · ") : `AI 行动 ${formatFileNames(item.files)}`
  }

  return item.files.length > 1
    ? `${item.actionLabel} ${formatFileNames(item.files)}`
    : item.summaries[0] ?? item.summary
}

function formatFileNames(files: RecentChangeFile[]): string {
  if (files.length === 0) return "未指定文件"
  return `${files
    .slice(0, 2)
    .map((file) => file.name)
    .join("、")}${files.length > 2 ? ` 等 ${files.length} 文件` : ""}`
}
