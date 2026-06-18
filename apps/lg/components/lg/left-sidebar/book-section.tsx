"use client"

import { useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
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
  onDeleteBook,
}: {
  books: Book[]
  activeBookId: string
  mode: "chat" | "writing" | "workbench"
  onNewBook: () => void
  onSelectBook: (id: string) => void
  onPrefetchBook: (id: string) => void
  onRenameBook: (bookId: string, newTitle: string) => void
  onDeleteBook: (bookId: string) => Promise<void>
}) {
  const [editingBookId, setEditingBookId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const editRef = useRef<HTMLInputElement>(null)

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
          <BookRow
            key={book.id}
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
            onDeleteBook={onDeleteBook}
          />
        )
      })}
    </SidebarSection>
  )
}
