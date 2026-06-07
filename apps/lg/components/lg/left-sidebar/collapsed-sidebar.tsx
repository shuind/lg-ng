"use client"

import { BookOpen, PanelLeft, Plus, Settings } from "lucide-react"
import type { Book } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export function CollapsedSidebar({
  books,
  activeBookId,
  mode,
  onToggleCollapsed,
  onSelectBook,
  onNewBook,
}: {
  books: Book[]
  activeBookId: string
  mode: "chat" | "writing" | "workbench"
  onToggleCollapsed: () => void
  onSelectBook: (id: string) => void
  onNewBook: () => void
}) {
  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col items-center gap-1 bg-sidebar/80 paper-soft py-4">
      <button
        onClick={onToggleCollapsed}
        className="rounded-lg p-2 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        title="展开侧栏"
        aria-label="展开侧栏"
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <div className="my-2 h-px w-6 bg-border/70" />
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-thin">
        {books.map((book) => (
          <button
            key={book.id}
            onClick={() => onSelectBook(book.id)}
            className={cn(
              "group relative flex h-9 w-9 items-center justify-center rounded-lg transition",
              book.id === activeBookId && mode !== "workbench"
                ? "bg-sidebar-accent text-foreground ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
            title={book.title}
          >
            <BookOpen className="h-4 w-4" />
          </button>
        ))}
        <button
          onClick={onNewBook}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          title="新建书籍"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        title="设置"
      >
        <Settings className="h-4 w-4" />
      </button>
    </aside>
  )
}
