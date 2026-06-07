"use client"

import { FileText, Plus } from "lucide-react"
import type { Chapter } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { SidebarSection } from "./section"

export function ChapterSection({
  chapters,
  activeChapterId,
  mode,
  onNewChapter,
  onSelectChapter,
}: {
  chapters: Chapter[]
  activeChapterId: string | null
  mode: "chat" | "writing" | "workbench"
  onNewChapter: () => void
  onSelectChapter: (id: string) => void
}) {
  return (
    <SidebarSection
      title="章节"
      actions={
        <button
          onClick={onNewChapter}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          aria-label="新建章节"
          title="新建章节"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      }
    >
      {chapters.map((chapter) => (
        <button
          key={chapter.id}
          onClick={() => onSelectChapter(chapter.id)}
          className={cn(
            "group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
            chapter.id === activeChapterId && mode === "writing"
              ? "bg-sidebar-accent text-foreground ring-1 ring-border/60"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              chapter.status === "done" && "bg-chart-2",
              chapter.status === "writing" && "bg-accent animate-pulse-dot",
              chapter.status === "draft" && "bg-border",
            )}
          />
          <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="flex-1 truncate font-serif">{chapter.title}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {chapter.wordCount > 0 ? `${(chapter.wordCount / 1000).toFixed(1)}k` : "—"}
          </span>
        </button>
      ))}
    </SidebarSection>
  )
}
