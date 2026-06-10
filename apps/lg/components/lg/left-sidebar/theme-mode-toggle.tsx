"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

const THEME_OPTIONS = [
  { value: "light", label: "亮色", icon: Sun },
  { value: "dark", label: "暗色", icon: Moon },
  { value: "system", label: "系统", icon: Monitor },
] as const

export function ThemeModeToggle({ compact = false }: { compact?: boolean }) {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className={compact ? "h-9 w-9" : "h-8"} />
  }

  if (compact) {
    const currentIndex = THEME_OPTIONS.findIndex((option) => option.value === theme)
    const current = THEME_OPTIONS[currentIndex >= 0 ? currentIndex : 2]
    const Icon = current.icon
    return (
      <button
        type="button"
        onClick={() => {
          const next = THEME_OPTIONS[((currentIndex >= 0 ? currentIndex : 2) + 1) % THEME_OPTIONS.length]
          setTheme(next.value)
        }}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        title={`主题：${current.label}`}
        aria-label={`主题：${current.label}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-sidebar-accent/45 p-1">
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon
        const active = theme === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground",
              active && "bg-sidebar text-foreground shadow-sm",
            )}
            title={option.label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
