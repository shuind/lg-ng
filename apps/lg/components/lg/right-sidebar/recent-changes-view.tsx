"use client"

import { useState } from "react"
import type { LedgerEntry } from "@/lib/types"
import { buildRecentChangeGroups } from "./recent-changes"
import { RecentChangeGroupSection } from "./recent-change-group-section"

export function RecentChangesView({
  entries,
  rollingBackEntryId,
  onOpenFile,
  onRollbackEntry,
}: {
  entries: LedgerEntry[]
  rollingBackEntryId?: string | null
  onOpenFile: (path: string) => void
  onRollbackEntry: (entryId: string) => void
}) {
  const recentEntries = entries.slice(0, 24)
  const groups = buildRecentChangeGroups(recentEntries)
  const [dateGroupOpenOverrides, setDateGroupOpenOverrides] = useState<Record<string, boolean>>({})
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set())

  function handleToggleDateGroup(groupKey: string) {
    const group = groups.find((currentGroup) => currentGroup.key === groupKey)
    if (!group) return
    const groupOpen = dateGroupOpenOverrides[groupKey] ?? group.defaultOpen
    setDateGroupOpenOverrides((current) => ({
      ...current,
      [groupKey]: !groupOpen,
    }))
  }

  function handleToggleBatch(itemId: string) {
    setExpandedBatchIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

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
          <RecentChangeGroupSection
            key={group.key}
            group={group}
            open={groupOpen}
            expandedBatchIds={expandedBatchIds}
            rollingBackEntryId={rollingBackEntryId}
            onToggleGroup={handleToggleDateGroup}
            onToggleBatch={handleToggleBatch}
            onOpenFile={onOpenFile}
            onRollbackEntry={onRollbackEntry}
          />
        )
      })}
    </div>
  )
}
