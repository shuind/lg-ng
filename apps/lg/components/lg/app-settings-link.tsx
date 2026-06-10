"use client"

import Link from "next/link"
import { Settings } from "lucide-react"

export function AppSettingsLink({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Link
        href="/settings"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        title="设置"
        aria-label="设置"
      >
        <Settings className="h-4 w-4" />
      </Link>
    )
  }

  return (
    <Link
      href="/settings"
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
    >
      <Settings className="h-3.5 w-3.5" />
      设置
    </Link>
  )
}
