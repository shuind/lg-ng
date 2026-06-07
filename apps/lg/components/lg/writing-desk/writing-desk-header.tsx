"use client"

import { Save } from "lucide-react"

export function WritingDeskHeader({
  title,
  wordCount,
  savedAt,
}: {
  title: string
  wordCount: number
  savedAt: string | null
}) {
  return (
    <header className="flex items-center justify-between px-10 pt-6 pb-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">写作台</div>
        <h1 className="font-serif text-xl tracking-wide text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{wordCount.toLocaleString()} 字</span>
        {savedAt && (
          <span className="flex items-center gap-1">
            <Save className="h-3 w-3" /> 已保存 {savedAt}
          </span>
        )}
      </div>
    </header>
  )
}
