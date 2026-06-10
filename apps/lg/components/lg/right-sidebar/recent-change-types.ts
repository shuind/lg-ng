import type { LedgerEntry } from "@/lib/types"

export type RecentChangeFile = {
  path: string
  name: string
  region: RecentChangeRegionKey
}

export type RecentChangeEntry = {
  id: string
  path: string
  name: string
  region: RecentChangeRegionKey
  rollbackable: boolean
}

export type RecentChangeActionKind = "agent_action" | "manual_save" | "rollback" | "change"

export type RecentChangeRegionKey = "body" | "draft" | "status" | "outline" | "setting" | "other"

export type RecentChangeRegion = {
  key: RecentChangeRegionKey
  label: string
  count: number
}

export type NormalizedRecentChange = {
  id: string
  actor: LedgerEntry["actor"]
  actorLabel: string
  actionKey: string
  actionLabel: string
  actionKind: RecentChangeActionKind
  timestamp: string
  timestampMs: number
  minuteKey: string
  dayKey: string
  dayLabel: string
  defaultOpen: boolean
  targetPath: string
  summary: string
  file: RecentChangeFile
  entry: RecentChangeEntry
  region: RecentChangeRegion
  hasBodyRisk: boolean
}

export type RecentChangeItem = {
  id: string
  actor: LedgerEntry["actor"]
  actorLabel: string
  actionKey: string
  actionLabel: string
  actionKind: RecentChangeActionKind
  timestamp: string
  timestampMs: number
  oldestTimestampMs: number
  minuteKey: string
  dayKey: string
  dayLabel: string
  defaultOpen: boolean
  targetPath: string
  summary: string
  summaries: string[]
  regions: RecentChangeRegion[]
  files: RecentChangeFile[]
  entries: RecentChangeEntry[]
  entryCount: number
  hasBodyRisk: boolean
  lowPriority: boolean
}

export type RecentChangeGroup = {
  key: string
  label: string
  defaultOpen: boolean
  items: RecentChangeItem[]
  entryCount: number
  fileCount: number
}
