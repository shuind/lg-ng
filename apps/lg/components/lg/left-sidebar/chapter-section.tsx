"use client"

import { FileText, Plus, Trash2 } from "lucide-react"
import type { Chapter } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SidebarSection } from "./section"

export function ChapterSection({
  chapters,
  activeChapterId,
  mode,
  onNewChapter,
  onDeleteChapter,
  onSelectChapter,
}: {
  chapters: Chapter[]
  activeChapterId: string | null
  mode: "chat" | "writing" | "workbench"
  onNewChapter: () => void
  onDeleteChapter: (chapterId: string) => Promise<void>
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
      {chapters.map((chapter) => {
        const active = chapter.id === activeChapterId && mode === "writing"

        return (
          <div
            key={chapter.id}
            className={cn(
              "group flex w-full items-center rounded-lg text-[13px] transition",
              active
                ? "bg-sidebar-accent text-foreground ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => onSelectChapter(chapter.id)}
              className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
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
              <span className="min-w-0 flex-1 truncate font-serif">{chapter.title}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                {chapter.wordCount > 0 ? `${(chapter.wordCount / 1000).toFixed(1)}k` : "—"}
              </span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (window.confirm(`删除章节「${chapter.title}」？`)) {
                  void onDeleteChapter(chapter.id)
                }
              }}
              className={cn(
                "mr-1 rounded-md p-1 transition",
                active
                  ? "text-muted-foreground hover:bg-background/40 hover:text-destructive"
                  : "text-muted-foreground/0 group-hover:text-muted-foreground hover:bg-sidebar-accent hover:text-destructive",
              )}
              aria-label={`删除章节 ${chapter.title}`}
              title="删除章节"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </SidebarSection>
  )
}
