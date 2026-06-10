"use client"

import { ChevronDown } from "lucide-react"
import type { Thread } from "@/lib/types"

export function ThreadMenuTrigger({
  activeThread,
  onToggle,
}: {
  activeThread?: Thread
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex max-w-[260px] items-center gap-2 rounded-full bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground ring-1 ring-border/60 backdrop-blur transition hover:bg-card hover:text-foreground"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2 animate-pulse-dot" />
      <span className="truncate">{activeThread?.title ?? "任务线程"}</span>
      <ChevronDown className="h-3 w-3 shrink-0" />
    </button>
  )
}
