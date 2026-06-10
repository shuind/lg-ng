"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecentChangeGroup, RecentChangeItem } from "./recent-change-types"
import { formatChangeTime } from "./recent-changes"
import { RecentChangeItemRow } from "./recent-change-item-row"

export function RecentChangeGroupSection({
  group,
  open,
  expandedBatchIds,
  rollingBackEntryId,
  onToggleGroup,
  onToggleBatch,
  onOpenFile,
  onRollbackEntry,
}: {
  group: RecentChangeGroup
  open: boolean
  expandedBatchIds: Set<string>
  rollingBackEntryId?: string | null
  onToggleGroup: (groupKey: string) => void
  onToggleBatch: (itemId: string) => void
  onOpenFile: (path: string) => void
  onRollbackEntry: (entryId: string) => void
}) {
  const itemGroups = buildRegionFoldGroups(group.items)
  const [openFoldKeys, setOpenFoldKeys] = useState<Set<string>>(new Set())

  function handleToggleFold(foldKey: string) {
    setOpenFoldKeys((current) => {
      const next = new Set(current)
      if (next.has(foldKey)) {
        next.delete(foldKey)
      } else {
        next.add(foldKey)
      }
      return next
    })
  }

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => onToggleGroup(group.key)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] text-muted-foreground/75 transition hover:bg-sidebar-accent/20 hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition", open && "rotate-90")} />
        <span className="font-medium text-foreground/70">{group.label}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {group.entryCount} 条 · {group.fileCount} 文件
        </span>
      </button>

      {open && (
        <div className="space-y-1">
          {itemGroups.map((itemGroup) => {
            const foldOpen = openFoldKeys.has(itemGroup.key)
            return (
              <div key={itemGroup.key} data-recent-change-fold-group={itemGroup.signatureKey} className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleToggleFold(itemGroup.key)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10.5px] text-muted-foreground/70 transition hover:bg-sidebar-accent/20 hover:text-foreground"
                  aria-expanded={foldOpen}
                >
                  <ChevronRight className={cn("h-3 w-3 shrink-0 transition", foldOpen && "rotate-90")} />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground/72">
                    {itemGroup.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground/55">
                    {formatFoldMeta(itemGroup)}
                  </span>
                </button>
                {foldOpen && (
                  <div className="space-y-1 pl-2">
                    {itemGroup.items.map((item) => (
                      <RecentChangeItemRow
                        key={item.id}
                        item={item}
                        expanded={expandedBatchIds.has(item.id)}
                        rollingBackEntryId={rollingBackEntryId}
                        hideRegionChips
                        onOpenFile={onOpenFile}
                        onRollbackEntry={onRollbackEntry}
                        onToggleBatch={onToggleBatch}
                      />
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
}

type RegionFoldGroup = {
  key: string
  signatureKey: string
  label: string
  items: RecentChangeItem[]
  hasAgentAction: boolean
  hasManualSave: boolean
  hasRollback: boolean
  hasBodyRisk: boolean
  latestTimestamp: string
  latestTimestampMs: number
}

function buildRegionFoldGroups(items: RecentChangeItem[]): RegionFoldGroup[] {
  const groups: RegionFoldGroup[] = []
  const groupBySignature = new Map<string, RegionFoldGroup>()

  for (const item of items) {
    const signatureKey = regionSignatureKey(item)
    const existing = groupBySignature.get(signatureKey)
    if (existing) {
      existing.items.push(item)
      existing.hasAgentAction = existing.hasAgentAction || item.actionKind === "agent_action"
      existing.hasManualSave = existing.hasManualSave || item.actionKind === "manual_save"
      existing.hasRollback = existing.hasRollback || item.actionKind === "rollback"
      existing.hasBodyRisk = existing.hasBodyRisk || item.hasBodyRisk
      if (item.timestampMs > existing.latestTimestampMs) {
        existing.latestTimestamp = item.timestamp
        existing.latestTimestampMs = item.timestampMs
      }
      continue
    }

    const nextGroup = {
      key: `${signatureKey}:${item.id}`,
      signatureKey,
      label: regionSignatureLabel(item),
      items: [item],
      hasAgentAction: item.actionKind === "agent_action",
      hasManualSave: item.actionKind === "manual_save",
      hasRollback: item.actionKind === "rollback",
      hasBodyRisk: item.hasBodyRisk,
      latestTimestamp: item.timestamp,
      latestTimestampMs: item.timestampMs,
    }
    groups.push(nextGroup)
    groupBySignature.set(signatureKey, nextGroup)
  }
  return groups
}

function regionSignatureKey(item: RecentChangeItem): string {
  return item.regions.map((region) => `${region.key}:${region.count}`).join("|") || "none"
}

function regionSignatureLabel(item: RecentChangeItem): string {
  return item.regions.map((region) => `${region.label} ${region.count}`).join(" · ") || "未分类"
}

function formatFoldMeta(group: RegionFoldGroup): string {
  const parts = []
  if (group.items.length > 1) parts.push(`${group.items.length} 次`)
  parts.push(formatFoldActionMeta(group))
  parts.push(formatChangeTime(group.latestTimestamp))
  if (group.hasBodyRisk) parts.push("待审")
  return parts.filter(Boolean).join(" · ")
}

function formatFoldActionMeta(group: RegionFoldGroup): string {
  const parts = []
  if (group.hasAgentAction) parts.push("AI")
  if (group.hasRollback) parts.push("回滚")
  if (parts.length > 0) return parts.join(" · ")
  if (group.hasManualSave) return "保存"
  return group.items[0]?.actionLabel ?? "编辑"
}
