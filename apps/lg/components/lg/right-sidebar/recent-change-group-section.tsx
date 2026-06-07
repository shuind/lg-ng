"use client"

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecentChangeGroup } from "./recent-change-types"
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
  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={() => onToggleGroup(group.key)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] text-muted-foreground transition hover:bg-sidebar-accent/25 hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition", open && "rotate-90")} />
        <span className="font-medium text-foreground/80">{group.label}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {group.entryCount} 条 · {group.fileCount} 文件
        </span>
      </button>

      {open && (
        <div className="relative">
          <div className="absolute bottom-3 left-[7px] top-3 w-px bg-border/30" />
          {group.items.map((item) => (
            <RecentChangeItemRow
              key={item.id}
              item={item}
              expanded={expandedBatchIds.has(item.id)}
              rollingBackEntryId={rollingBackEntryId}
              onOpenFile={onOpenFile}
              onRollbackEntry={onRollbackEntry}
              onToggleBatch={onToggleBatch}
            />
          ))}
        </div>
      )}
    </section>
  )
}
