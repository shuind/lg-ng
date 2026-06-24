"use client"

import { ChevronRight } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export function VolumeGroup({
  bookId,
  scope,
  groupKey,
  title,
  count,
  path,
  children,
  onOpenPath,
}: {
  bookId: string
  scope: string
  groupKey: string
  title: string
  count: number
  path?: string
  children: ReactNode
  onOpenPath?: (path: string) => void
}) {
  const storageKey = `lg:left-sidebar:${bookId}:${scope}:${groupKey}`
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === "open") setOpen(true)
    else if (saved === "closed") setOpen(false)
    else setOpen(true)
  }, [storageKey])

  function toggleOpen() {
    setOpen((current) => {
      const next = !current
      window.localStorage.setItem(storageKey, next ? "open" : "closed")
      return next
    })
  }

  return (
    <div className="space-y-1">
      <div className="group flex min-w-0 items-center rounded-md border border-border/25 bg-sidebar-accent/15 text-[11.5px] text-muted-foreground shadow-[inset_2px_0_0_hsl(var(--accent)/0.35)] transition hover:border-border/45 hover:bg-sidebar-accent/35 hover:text-foreground">
        <button
          type="button"
          onClick={toggleOpen}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45"
          aria-label={`${open ? "收起" : "展开"}${title}`}
          aria-expanded={open}
        >
          <ChevronRight className={cn("h-3 w-3 transition", open && "rotate-90")} />
        </button>
        {path && onOpenPath ? (
          <button
            type="button"
            onClick={() => onOpenPath(path)}
            className="min-w-0 flex-1 truncate py-1 text-left font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45"
            title={title}
          >
            {title}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate py-1 font-medium" title={title}>
            {title}
          </span>
        )}
        <span className="mr-1.5 rounded bg-background/35 px-1.5 py-0.5 font-mono text-[9.5px] tabular-nums text-muted-foreground/60">
          {count}
        </span>
      </div>
      {open && count > 0 && (
        <div className="ml-3 space-y-0.5 border-l border-border/45 pl-2.5">
          {children}
        </div>
      )}
    </div>
  )
}
