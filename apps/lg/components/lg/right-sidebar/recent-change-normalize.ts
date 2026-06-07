import type { LedgerEntry } from "@/lib/types"
import { canDirectRollback } from "@/lib/ledger-entry-utils"
import type { NormalizedRecentChange } from "./recent-change-types"
import { pad2 } from "./recent-change-format"

export function normalizeRecentChange(entry: LedgerEntry): NormalizedRecentChange {
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
    entry: {
      id: entry.id,
      path: targetPath,
      name: file.name,
      rollbackable: entry.actor === "agent" && canDirectRollback(entry),
    },
  }
}

export function normalizePathKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").trim().toLowerCase()
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
