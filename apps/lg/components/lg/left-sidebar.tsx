"use client"

import type { Book, Chapter, OutlineFile } from "@/lib/mock-data"
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
  onSelectChapter: (id: string) => void
  onBackToChat: () => void
  onNewBook: () => void
  onNewChapter: () => void
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
  onSelectChapter,
  onBackToChat,
  onNewBook,
  onNewChapter,
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
            onSelectChapter={onSelectChapter}
          />
        </div>
      </div>

      <SidebarFooter mode={mode} onBackToChat={onBackToChat} />
    </aside>
  )
}
