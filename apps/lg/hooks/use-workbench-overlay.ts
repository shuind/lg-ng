"use client"

import { useCallback, useMemo, useState } from "react"
import type { Book } from "@/lib/types"
import type { Tab, WorkbenchOpenOptions } from "@/components/lg/workbench/types"

export function useWorkbenchOverlay(books: Book[]) {
  const [bookId, setBookId] = useState<string | null>(null)
  const [initialPath, setInitialPath] = useState<string | undefined>(undefined)
  const [initialLine, setInitialLine] = useState<number | undefined>(undefined)
  const [initialTab, setInitialTab] = useState<Tab | undefined>(undefined)
  const [initialLedgerEntryId, setInitialLedgerEntryId] = useState<string | undefined>(undefined)

  const book = useMemo(
    () => books.find((item) => item.id === bookId),
    [books, bookId],
  )

  const open = useCallback((nextBookId: string, options?: string | WorkbenchOpenOptions) => {
    const nextOptions = typeof options === "string" ? { path: options } : options
    setBookId(nextBookId)
    setInitialPath(nextOptions?.path)
    setInitialLine(nextOptions?.initialLine)
    setInitialTab(nextOptions?.initialTab)
    setInitialLedgerEntryId(nextOptions?.initialLedgerEntryId)
  }, [])

  const close = useCallback(() => {
    setBookId(null)
    setInitialPath(undefined)
    setInitialLine(undefined)
    setInitialTab(undefined)
    setInitialLedgerEntryId(undefined)
  }, [])

  return {
    book,
    initialPath,
    initialLine,
    initialTab,
    initialLedgerEntryId,
    open,
    close,
  }
}
