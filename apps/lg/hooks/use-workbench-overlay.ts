"use client"

import { useCallback, useMemo, useState } from "react"
import type { Book } from "@/lib/mock-data"

export function useWorkbenchOverlay(books: Book[]) {
  const [bookId, setBookId] = useState<string | null>(null)
  const [initialPath, setInitialPath] = useState<string | undefined>(undefined)

  const book = useMemo(
    () => books.find((item) => item.id === bookId),
    [books, bookId],
  )

  const open = useCallback((nextBookId: string, path?: string) => {
    setBookId(nextBookId)
    setInitialPath(path)
  }, [])

  const close = useCallback(() => {
    setBookId(null)
    setInitialPath(undefined)
  }, [])

  return {
    book,
    initialPath,
    open,
    close,
  }
}
