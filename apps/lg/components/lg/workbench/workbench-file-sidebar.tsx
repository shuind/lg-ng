"use client"

import { Search } from "lucide-react"
import type { WorkbenchGroup } from "@/lib/types"
import { FileGroup } from "./file-tree"
import { countWorkbenchFiles } from "./workbench-utils"

export function WorkbenchFileSidebar({
  groups,
  activePath,
  query,
  onQueryChange,
  onSelectFile,
}: {
  groups: WorkbenchGroup[]
  activePath: string
  query: string
  onQueryChange: (query: string) => void
  onSelectFile: (path: string) => void
}) {
  const forceOpen = query.trim().length > 0

  return (
    <aside className="min-h-0 border-l border-border/60 bg-sidebar/80 paper-soft">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索文件或路径"
              className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
            />
          </div>
          <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/75">项目文件</span>
            <span className="font-mono text-[10px]">{countWorkbenchFiles(groups)} 个</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
          {groups.length > 0 ? (
            groups.map((group) => (
              <FileGroup
                key={group.id}
                group={group}
                activePath={activePath}
                forceOpen={forceOpen}
                onSelect={onSelectFile}
              />
            ))
          ) : (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">没有找到匹配文件</div>
          )}
        </div>
      </div>
    </aside>
  )
}
