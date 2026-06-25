"use client"

import { useEffect } from "react"
import { X } from "lucide-react"

type MobileDrawerProps = {
  open: boolean
  side: "left" | "right"
  title: string
  onClose: () => void
  children: React.ReactNode
}

export function MobileDrawer({ open, side, title, onClose, children }: MobileDrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <div className={open ? "pointer-events-auto" : "pointer-events-none"} aria-hidden={!open}>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* 抽屉面板 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-y-0 z-50 flex w-[86%] max-w-[340px] flex-col bg-background shadow-2xl transition-transform duration-300 ease-out ${
          side === "left"
            ? `left-0 border-r border-border/60 ${open ? "translate-x-0" : "-translate-x-full"}`
            : `right-0 border-l border-border/60 ${open ? "translate-x-0" : "translate-x-full"}`
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/65">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
