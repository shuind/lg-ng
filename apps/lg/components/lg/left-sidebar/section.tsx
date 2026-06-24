"use client"

import { ChevronRight } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SidebarSection({
  title,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  storageKey,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  storageKey?: string
}) {
  const contentId = useId()
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (!collapsible || !storageKey) {
      setOpen(defaultOpen)
      return
    }
    const saved = window.localStorage.getItem(storageKey)
    if (saved === "open") setOpen(true)
    else if (saved === "closed") setOpen(false)
    else setOpen(defaultOpen)
  }, [collapsible, defaultOpen, storageKey])

  function toggleOpen() {
    setOpen((current) => {
      const next = !current
      if (collapsible && storageKey) {
        window.localStorage.setItem(storageKey, next ? "open" : "closed")
      }
      return next
    })
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        {collapsible ? (
          <button
            type="button"
            onClick={toggleOpen}
            className="-ml-3 flex min-w-0 items-center gap-1 rounded-md py-0.5 pl-0.5 pr-1 text-left text-[10.5px] font-semibold uppercase tracking-[0.16em] text-foreground/65 transition hover:bg-sidebar-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45"
            aria-expanded={open}
            aria-controls={contentId}
          >
            <ChevronRight className={cn("h-3 w-3 shrink-0 transition", open && "rotate-90")} />
            <span className="truncate">{title}</span>
          </button>
        ) : (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-foreground/65">
            {title}
          </span>
        )}
        <div className="flex items-center gap-0.5">{actions}</div>
      </div>
      {(!collapsible || open) && (
        <div id={contentId} className="space-y-0.5 pt-0.5">
          {children}
        </div>
      )}
    </div>
  )
}
