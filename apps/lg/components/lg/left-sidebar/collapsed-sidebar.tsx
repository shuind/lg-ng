"use client"

import { useEffect, useRef } from "react"
import { BookOpen, PanelLeft, Plus } from "lucide-react"
import { AppSettingsLink } from "@/components/lg/app-settings-link"
import type { Book } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ThemeModeToggle } from "./theme-mode-toggle"

export function CollapsedSidebar({
  books,
  activeBookId,
  mode,
  onToggleCollapsed,
  onSelectBook,
  onPrefetchBook,
  onNewBook,
}: {
  books: Book[]
  activeBookId: string
  mode: "chat" | "writing" | "workbench"
  onToggleCollapsed: () => void
  onSelectBook: (id: string) => void
  onPrefetchBook: (id: string) => void
  onNewBook: () => void
}) {
  const prefetchTimersRef = useRef<Map<string, number>>(new Map())

  function cancelPrefetch(bookId: string) {
    const timer = prefetchTimersRef.current.get(bookId)
    if (timer === undefined) return
    window.clearTimeout(timer)
    prefetchTimersRef.current.delete(bookId)
  }

  function schedulePrefetch(bookId: string) {
    cancelPrefetch(bookId)
    const timer = window.setTimeout(() => {
      prefetchTimersRef.current.delete(bookId)
      onPrefetchBook(bookId)
    }, 150)
    prefetchTimersRef.current.set(bookId, timer)
  }

  useEffect(() => () => {
    prefetchTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    prefetchTimersRef.current.clear()
  }, [])

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
            onPointerEnter={() => schedulePrefetch(book.id)}
            onPointerLeave={() => cancelPrefetch(book.id)}
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
      <AppSettingsLink compact />
      <ThemeModeToggle compact />
    </aside>
  )
}
