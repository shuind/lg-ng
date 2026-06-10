"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { LeftSidebar } from "@/components/lg/left-sidebar"
import type { AppShellProps } from "./types"

type LeftSidebarColumnProps = Pick<
  AppShellProps,
  | "books"
  | "chapters"
  | "outlines"
  | "activeBookId"
  | "activeChapterId"
  | "mode"
  | "collapsed"
  | "onToggleCollapsed"
  | "onSelectBook"
  | "onPrefetchBook"
  | "onSelectChapter"
  | "onBackToChat"
  | "onNewBook"
  | "onNewChapter"
  | "onDeleteChapter"
  | "onOpenWorkbench"
  | "onRenameBook"
>

export function LeftSidebarColumn({
  books,
  chapters,
  outlines,
  activeBookId,
  activeChapterId,
  mode,
  collapsed,
  onToggleCollapsed,
  onSelectBook,
  onPrefetchBook,
  onSelectChapter,
  onBackToChat,
  onNewBook,
  onNewChapter,
  onDeleteChapter,
  onOpenWorkbench,
  onRenameBook,
}: LeftSidebarColumnProps) {
  return (
    <div className="relative min-h-0 border-r border-border/60">
      <button
        onClick={onToggleCollapsed}
        className="group absolute -right-3 top-1/2 z-20 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-md bg-card/0 text-muted-foreground/40 transition hover:bg-card/80 hover:text-foreground hover:shadow-sm"
        aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
        title={collapsed ? "展开侧栏" : "折叠侧栏"}
      >
        <span className="absolute left-2 h-8 w-px bg-border/60 transition group-hover:bg-border" />
        {collapsed ? (
          <ChevronRight className="relative h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="relative h-3.5 w-3.5" />
        )}
      </button>
      <LeftSidebar
        books={books}
        chapters={chapters}
        outlines={outlines}
        activeBookId={activeBookId}
        activeChapterId={activeChapterId}
        mode={mode}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        onSelectBook={onSelectBook}
        onPrefetchBook={onPrefetchBook}
        onSelectChapter={onSelectChapter}
        onBackToChat={onBackToChat}
        onNewBook={onNewBook}
        onNewChapter={onNewChapter}
        onDeleteChapter={onDeleteChapter}
        onOpenWorkbench={onOpenWorkbench}
        onRenameBook={onRenameBook}
      />
    </div>
  )
}
