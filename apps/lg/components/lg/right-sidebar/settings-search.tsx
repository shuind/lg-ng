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
    <div className="space-y-2 pb-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索人物、地点、规则"
          className="w-full rounded-md border border-border/50 bg-background/45 py-1.5 pl-7 pr-7 text-[12px] outline-none placeholder:text-muted-foreground/55 focus:ring-1 focus:ring-ring/45"
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
      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/75">设定索引</span>
        <span className="font-mono text-[10px]">
          {visibleCount}/{totalCount} 张
        </span>
      </div>
    </div>
  )
}
