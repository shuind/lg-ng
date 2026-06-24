"use client"

import { Plus, Trash2 } from "lucide-react"
import { useWorkbenchOpen } from "@/components/lg/workbench-open-context"
import type { Chapter, OutlineFile } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SidebarSection } from "./section"
import { groupChapterNavByVolume } from "./volume-groups"
import { VolumeGroup } from "./volume-group"

export function ChapterSection({
  bookId,
  chapters,
  outlines,
  activeChapterId,
  mode,
  onNewChapter,
  onDeleteChapter,
  onSelectChapter,
}: {
  bookId: string
  chapters: Chapter[]
  outlines: OutlineFile[]
  activeChapterId: string | null
  mode: "chat" | "writing" | "workbench"
  onNewChapter: () => void
  onDeleteChapter: (chapterId: string) => Promise<void>
  onSelectChapter: (id: string) => void
}) {
  const workbenchOpen = useWorkbenchOpen()
  const groups = groupChapterNavByVolume(chapters, outlines)

  return (
    <SidebarSection
      title="章节"
      collapsible
      storageKey={`lg:left-sidebar:${bookId}:chapters`}
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
      <div className="space-y-1">
        {groups.map((group) => (
          <VolumeGroup
            key={group.key}
            bookId={bookId}
            scope="chapters"
            groupKey={group.key}
            title={group.title}
            path={group.path}
            count={group.items.length}
            onOpenPath={(path) => workbenchOpen?.openPath(path)}
          >
            {group.items.map((entry) => {
              const { chapter, outline } = entry
              const active = chapter?.id === activeChapterId && mode === "writing"

              return (
                <div
                  key={entry.key}
                  className={cn(
                    "group flex w-full items-center rounded-md text-[12.5px] transition",
                    active
                      ? "selected-bar bg-sidebar-accent font-medium text-foreground ring-1 ring-border/60"
                      : "text-muted-foreground hover:bg-sidebar-accent/55 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (chapter) {
                        onSelectChapter(chapter.id)
                        return
                      }
                      if (outline) workbenchOpen?.openPath(outline.path)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground/55">
                      {entry.shortLabel ?? ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-serif">{entry.title}</span>
                    <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground/45">
                      {chapter && chapter.wordCount > 0 ? `${(chapter.wordCount / 1000).toFixed(1)}k` : "—"}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5 pr-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (outline) workbenchOpen?.openPath(outline.path)
                      }}
                      disabled={!outline}
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[10px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45",
                        outline
                          ? "chip-quiet text-muted-foreground hover:bg-background/60 hover:text-foreground"
                          : "cursor-default text-muted-foreground/20",
                      )}
                      aria-label={outline ? `打开章纲 ${entry.title}` : `${entry.title} 暂无章纲`}
                      title={outline ? "打开章纲" : "暂无章纲"}
                    >
                      纲
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (chapter) onSelectChapter(chapter.id)
                      }}
                      disabled={!chapter}
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[10px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45",
                        chapter
                          ? "chip-quiet text-muted-foreground hover:bg-background/60 hover:text-foreground"
                          : "cursor-default text-muted-foreground/20",
                      )}
                      aria-label={chapter ? `打开正文 ${entry.title}` : `${entry.title} 暂无正文`}
                      title={chapter ? "打开正文" : "暂无正文"}
                    >
                      文
                    </button>
                  </div>

                  {chapter && (
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
                  )}
                </div>
              )
            })}
          </VolumeGroup>
        ))}
      </div>
    </SidebarSection>
  )
}
