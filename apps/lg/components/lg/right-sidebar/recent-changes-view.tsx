"use client"

import { useState } from "react"
import { Clock3 } from "lucide-react"
import type { LedgerEntry } from "@/lib/types"
import { buildRecentChangeGroups } from "./recent-changes"
import { RecentChangeGroupSection } from "./recent-change-group-section"
import { PanelEmpty } from "./panel-empty"

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
  const groups = buildRecentChangeGroups(entries, { itemLimit: 8 })
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

  if (entries.length === 0) {
    return (
      <PanelEmpty
        icon={Clock3}
        title="暂无改动记录"
        description="当 Agent 修改项目文件后，改动会按时间出现在这里，并可随时回滚。"
      />
    )
  }

  return (
    <div className="space-y-2.5">
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
