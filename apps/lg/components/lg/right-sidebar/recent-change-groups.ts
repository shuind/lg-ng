import type { LedgerEntry } from "@/lib/types"
import type { NormalizedRecentChange, RecentChangeGroup, RecentChangeItem } from "./recent-change-types"
import { normalizePathKey, normalizeRecentChange } from "./recent-change-normalize"

export function buildRecentChangeGroups(entries: LedgerEntry[]): RecentChangeGroup[] {
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
    entries: [change.entry],
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
  item.entries.push(change.entry)

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
