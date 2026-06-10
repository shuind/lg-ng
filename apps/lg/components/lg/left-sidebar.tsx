"use client"

import type { Book, Chapter, OutlineFile } from "@/lib/types"
import { BookSection } from "./left-sidebar/book-section"
import { ChapterSection } from "./left-sidebar/chapter-section"
import { CollapsedSidebar } from "./left-sidebar/collapsed-sidebar"
import { SidebarFooter } from "./left-sidebar/footer"
import { SidebarHeader } from "./left-sidebar/header"
import { OutlineSection } from "./left-sidebar/outline-section"

interface LeftSidebarProps {
  books: Book[]
  chapters: Chapter[]
  outlines: OutlineFile[]
  activeBookId: string
  activeChapterId: string | null
  mode: "chat" | "writing" | "workbench"
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelectBook: (id: string) => void
  onPrefetchBook: (id: string) => void
  onSelectChapter: (id: string) => void
  onBackToChat: () => void
  onNewBook: () => void
  onNewChapter: () => void
  onDeleteChapter: (chapterId: string) => Promise<void>
  onOpenWorkbench: (bookId: string, path?: string) => void
  onRenameBook: (bookId: string, newTitle: string) => void
}

export function LeftSidebar({
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
}: LeftSidebarProps) {
  if (collapsed) {
    return (
      <CollapsedSidebar
        books={books}
        activeBookId={activeBookId}
        mode={mode}
        onToggleCollapsed={onToggleCollapsed}
        onSelectBook={onSelectBook}
        onPrefetchBook={onPrefetchBook}
        onNewBook={onNewBook}
      />
    )
  }

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col bg-sidebar/80 paper-soft">
      <SidebarHeader onToggleCollapsed={onToggleCollapsed} />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
        <BookSection
          books={books}
          activeBookId={activeBookId}
          mode={mode}
          onNewBook={onNewBook}
          onSelectBook={onSelectBook}
          onPrefetchBook={onPrefetchBook}
          onOpenWorkbench={onOpenWorkbench}
          onRenameBook={onRenameBook}
        />

        <div className="mt-4">
          <OutlineSection
            outlines={outlines}
            activeBookId={activeBookId}
            onOpenWorkbench={onOpenWorkbench}
          />
        </div>

        <div className="mt-4">
          <ChapterSection
            chapters={chapters}
            activeChapterId={activeChapterId}
            mode={mode}
            onNewChapter={onNewChapter}
            onDeleteChapter={onDeleteChapter}
            onSelectChapter={onSelectChapter}
          />
        </div>
      </div>

      <SidebarFooter mode={mode} onBackToChat={onBackToChat} />
    </aside>
  )
}
