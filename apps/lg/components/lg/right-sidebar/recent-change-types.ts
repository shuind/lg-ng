import type { LedgerEntry } from "@/lib/types"

export type RecentChangeFile = {
  path: string
  name: string
}

export type RecentChangeEntry = {
  id: string
  path: string
  name: string
  rollbackable: boolean
}

export type NormalizedRecentChange = {
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
  entry: RecentChangeEntry
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
  entries: RecentChangeEntry[]
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
