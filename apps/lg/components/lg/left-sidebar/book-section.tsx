"use client"

import { useEffect, useRef, useState } from "react"
import { FolderOpen, Plus } from "lucide-react"
import { useWorkbenchOpen } from "@/components/lg/workbench-open-context"
import type { Book } from "@/lib/types"
import { BookRow } from "./book-row"
import { SidebarSection } from "./section"

export function BookSection({
  books,
  activeBookId,
  mode,
  onNewBook,
  onSelectBook,
  onPrefetchBook,
  onRenameBook,
}: {
  books: Book[]
  activeBookId: string
  mode: "chat" | "writing" | "workbench"
  onNewBook: () => void
  onSelectBook: (id: string) => void
  onPrefetchBook: (id: string) => void
  onRenameBook: (bookId: string, newTitle: string) => void
}) {
  const [editingBookId, setEditingBookId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const editRef = useRef<HTMLInputElement>(null)
  const workbenchOpen = useWorkbenchOpen()

  useEffect(() => {
    if (editingBookId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingBookId])

  function startRename(bookId: string, currentTitle: string) {
    setEditingBookId(bookId)
    setEditValue(currentTitle)
  }

  function commitRename() {
    if (editingBookId && editValue.trim()) {
      onRenameBook(editingBookId, editValue.trim())
    }
    setEditingBookId(null)
  }

  return (
    <SidebarSection
      title="书籍"
      actions={
        <button
          type="button"
          onClick={onNewBook}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          aria-label="新建书籍"
          title="新建书籍"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      }
    >
      {books.map((book) => {
        const active = book.id === activeBookId && mode !== "workbench"

        return (
          <div key={book.id} className="space-y-0.5">
            <BookRow
              book={book}
              active={active}
              isEditing={editingBookId === book.id}
              editRef={editRef}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onCommitRename={commitRename}
              onCancelRename={() => setEditingBookId(null)}
              onSelectBook={onSelectBook}
              onPrefetchBook={onPrefetchBook}
              onStartRename={startRename}
            />
            {active ? (
              <button
                type="button"
                onClick={() => workbenchOpen?.open()}
                className="ml-8 flex h-7 w-[calc(100%-2rem)] items-center gap-2 rounded-md px-2 text-left text-[12px] text-muted-foreground transition hover:bg-sidebar-accent/45 hover:text-foreground"
                aria-label="打开工作台"
                title="打开工作台"
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">打开工作台</span>
              </button>
            ) : null}
          </div>
        )
      })}
    </SidebarSection>
  )
}
