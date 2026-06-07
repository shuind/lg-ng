"use client"

import { cn } from "@/lib/utils"

export function ToolBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-secondary hover:text-foreground",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
      )}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  )
}
