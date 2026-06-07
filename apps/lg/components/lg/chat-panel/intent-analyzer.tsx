"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import type { Turn } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export function IntentAnalyzer({ turn }: { turn: Turn }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border/50">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-[12px] text-foreground">LG 正在处理这轮请求...</div>
        <div className="flex gap-1.5 text-[10px] text-muted-foreground">
          <Step done>Observe</Step>
          <Step active>Retrieve</Step>
          <Step>Ground</Step>
          <Step>Plan</Step>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground/70">{turn.id}</div>
      </div>
    </div>
  )
}

function Step({
  children,
  done,
  active,
}: {
  children: ReactNode
  done?: boolean
  active?: boolean
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono",
        done && "bg-chart-2/20 text-chart-2",
        active && "bg-accent/30 text-accent-foreground animate-pulse-dot",
        !done && !active && "text-muted-foreground/50",
      )}
    >
      {children}
    </span>
  )
}
