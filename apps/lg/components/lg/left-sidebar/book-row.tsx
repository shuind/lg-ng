"use client"

import { useEffect, useRef, type RefObject } from "react"
import { Pencil, Trash2 } from "lucide-react"
import type { Book } from "@/lib/types"
import { cn } from "@/lib/utils"

export function BookRow({
  book,
  active,
  isEditing,
  editRef,
  editValue,
  onEditValueChange,
  onCommitRename,
  onCancelRename,
  onSelectBook,
  onPrefetchBook,
  onStartRename,
  onDeleteBook,
}: {
  book: Book
  active: boolean
  isEditing: boolean
  editRef: RefObject<HTMLInputElement | null>
  editValue: string
  onEditValueChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onSelectBook: (bookId: string) => void
  onPrefetchBook: (bookId: string) => void
  onStartRename: (bookId: string, currentTitle: string) => void
  onDeleteBook: (bookId: string) => Promise<void>
}) {
  const prefetchTimerRef = useRef<number | null>(null)

  function cancelPrefetch() {
    if (prefetchTimerRef.current === null) return
    window.clearTimeout(prefetchTimerRef.current)
    prefetchTimerRef.current = null
  }

  function schedulePrefetch() {
    cancelPrefetch()
    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null
      onPrefetchBook(book.id)
    }, 150)
  }

  useEffect(() => cancelPrefetch, [])

  return (
    <div
      onPointerEnter={schedulePrefetch}
      onPointerLeave={cancelPrefetch}
      className={cn(
        "group flex items-center gap-1 rounded-lg pr-1 transition",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2">
          <input
            ref={editRef}
            value={editValue}
            onChange={(event) => onEditValueChange(event.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") onCommitRename()
              if (event.key === "Escape") onCancelRename()
            }}
            className="flex-1 rounded bg-transparent px-1 text-[13px] outline-none ring-1 ring-ring"
          />
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-0.5 pl-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onStartRename(book.id, book.title)
              }}
              className={cn(
                "rounded-md p-1 transition",
                active
                  ? "text-muted-foreground opacity-100 hover:bg-background/40 hover:text-foreground"
                  : "text-muted-foreground/0 group-hover:text-muted-foreground group-hover:opacity-100 hover:bg-sidebar-accent hover:text-foreground",
              )}
              aria-label="重命名"
              title="重命名书籍"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (window.confirm(`删除书籍「${book.title}」？这会永久删除整本书的文件、章节和工作记录。`)) {
                  void onDeleteBook(book.id)
                }
              }}
              className={cn(
                "rounded-md p-1 transition",
                active
                  ? "text-muted-foreground opacity-100 hover:bg-background/40 hover:text-destructive"
                  : "text-muted-foreground/0 group-hover:text-muted-foreground group-hover:opacity-100 hover:bg-sidebar-accent hover:text-destructive",
              )}
              aria-label={`删除书籍 ${book.title}`}
              title="删除书籍"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSelectBook(book.id)}
            className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2 text-left text-[13px]"
          >
            <span className="min-w-0 flex-1 truncate">{book.title}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">{book.updatedAt}</span>
          </button>
        </>
      )}
    </div>
  )
}
