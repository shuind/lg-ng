"use client"

import { PanelLeftClose, Sparkles } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export function SidebarHeader({ onToggleCollapsed }: { onToggleCollapsed: () => void }) {
  return (
    <div className="shrink-0 px-5 pb-3 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="surface-2 relative h-7 w-7 rounded-lg border border-border/60">
            <Sparkles className="absolute inset-0 m-auto h-3.5 w-3.5 text-accent-foreground/80" />
          </div>
          <div className="leading-tight">
            <div className="font-serif text-[15px] font-medium tracking-wide text-foreground">LG</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Atelier</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <button
            onClick={onToggleCollapsed}
            className="hidden rounded-md p-1.5 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground md:block"
            aria-label="折叠侧栏"
            title="折叠侧栏"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-3 h-px bg-border/60" />
    </div>
  )
}
