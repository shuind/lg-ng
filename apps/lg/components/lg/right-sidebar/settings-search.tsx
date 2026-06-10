"use client"

import { Search, X } from "lucide-react"

export function SettingsSearch({
  query,
  visibleCount,
  totalCount,
  onQueryChange,
}: {
  query: string
  visibleCount: number
  totalCount: number
  onQueryChange: (query: string) => void
}) {
  return (
    <div className="space-y-1.5 pb-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索人物、地点、规则"
          className="w-full rounded-lg border border-border/35 bg-background/30 py-1.5 pl-7 pr-7 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground/60 transition hover:bg-secondary hover:text-foreground"
            aria-label="清空设定卡搜索"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground/70">
        <span className="font-medium text-foreground/75">设定索引</span>
        <span className="font-mono text-[10px]">
          {visibleCount}/{totalCount} 张
        </span>
      </div>
    </div>
  )
}
