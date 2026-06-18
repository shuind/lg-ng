"use client"

import { cn } from "@/lib/utils"

export function ToolBtn({
  icon,
  label,
  active,
  disabled,
  showLabel,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  showLabel?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-secondary hover:text-foreground",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
        disabled && "pointer-events-none opacity-45",
      )}
      title={label}
      aria-label={label}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </button>
  )
}
