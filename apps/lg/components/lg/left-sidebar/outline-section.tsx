"use client"

import { BookMarked } from "lucide-react"
import { useWorkbenchOpen } from "@/components/lg/workbench-open-context"
import type { OutlineFile } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SidebarSection } from "./section"

export function OutlineSection({
  outlines,
}: {
  outlines: OutlineFile[]
}) {
  const workbenchOpen = useWorkbenchOpen()

  return (
    <SidebarSection title="大纲">
      {outlines.length > 0 ? (
        outlines.map((outline) => (
          <button
            key={outline.id}
            onClick={() => workbenchOpen?.openPath(outline.path)}
            className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted-foreground transition hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase",
                outline.level === "volume"
                  ? "bg-accent/15 text-accent-foreground"
                  : "bg-muted/60 text-muted-foreground",
              )}
            >
              {outline.level === "volume" ? "卷" : "章"}
            </span>
            <BookMarked className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate font-serif">{outline.title}</span>
          </button>
        ))
      ) : (
        <div className="rounded-lg px-2.5 py-2 text-[12px] leading-relaxed text-muted-foreground/70">
          保存卷纲或章纲后会显示在这里。
        </div>
      )}
    </SidebarSection>
  )
}
