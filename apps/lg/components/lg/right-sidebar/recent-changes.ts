import type { LedgerEntry } from "@/lib/types"

export type RecentChangeFile = {
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

export type RecentChangeItem = {
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

export type RecentChangeGroup = {
  key: string
  label: string
  defaultOpen: boolean
  items: RecentChangeItem[]
  entryCount: number
  fileCount: number
}

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

export function formatChangeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "未知"

  const diff = Date.now() - date.getTime()
  if (diff >= 0 && diff < 7 * 86400000) {
    return formatRelativeTime(iso)
  }

  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function formatFilePreview(files: RecentChangeFile[]): string {
  if (files.length === 0) return "未指定文件"
  if (files.length === 1) return files[0].path
  return `${files
    .slice(0, 2)
    .map((file) => file.name)
    .join("、")}${files.length > 2 ? ` 等 ${files.length} 个文件` : ""}`
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

function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).pop() || filePath || "未命名文件"
}

function normalizePathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").trim().toLowerCase()
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
