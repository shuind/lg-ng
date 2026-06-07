"use client"

import { useEffect, useState } from "react"
import { ChevronRight, FileText } from "lucide-react"
import type { WorkbenchFile, WorkbenchGroup } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const DEFAULT_OPEN_WORKBENCH_GROUPS = new Set([
  "章节正文",
  "卷纲",
  "章节大纲",
  "人物设定",
  "世界观",
])

export function FileGroup({
  group,
  activePath,
  forceOpen = false,
  onSelect,
}: {
  group: WorkbenchGroup
  activePath: string
  forceOpen?: boolean
  onSelect: (path: string) => void
}) {
  const hasActiveFile = group.files.some((file) => file.path === activePath)
  const defaultOpen = DEFAULT_OPEN_WORKBENCH_GROUPS.has(group.label)
  const [open, setOpen] = useState(forceOpen || hasActiveFile || defaultOpen)
  const visibleOpen = forceOpen || hasActiveFile || open

  useEffect(() => {
    if (forceOpen || hasActiveFile) {
      setOpen(true)
      return
    }
    setOpen(defaultOpen)
  }, [forceOpen, hasActiveFile, defaultOpen])

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] text-foreground/90 transition hover:bg-sidebar-accent/40"
        aria-expanded={visibleOpen}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition", visibleOpen && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate font-medium">{group.label}</span>
        <span className="font-mono text-[10px] leading-none text-muted-foreground/65">
          {group.files.length}
        </span>
      </button>
      {visibleOpen && (
        <div className="ml-2 space-y-0.5 border-l border-border/40 pl-1">
          {group.files.map((f) => (
            <FileItem
              key={f.id}
              file={f}
              active={f.path === activePath}
              onSelect={() => onSelect(f.path)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileItem({
  file,
  active,
  onSelect,
}: {
  file: WorkbenchFile
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition",
        active
          ? "bg-card text-foreground ring-1 ring-border/60 shadow-sm"
          : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground",
      )}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate text-[11.5px]" title={file.path}>
        {file.name}
      </span>
      {file.modified && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />}
    </button>
  )
}

