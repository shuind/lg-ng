"use client"

import { useCallback, useRef } from "react"
import { initBook, listLedgerEntries } from "@/lib/api"
import type { LedgerEntry } from "@/lib/types"

type BookInitSnapshot = Awaited<ReturnType<typeof initBook>>

export type BookSnapshot = BookInitSnapshot & {
  ledgerEntries: LedgerEntry[]
  fetchedAt: number
}

export function useBookSnapshotCache() {
  const cacheRef = useRef<Map<string, BookSnapshot>>(new Map())
  const inflightRef = useRef<Map<string, Promise<BookSnapshot>>>(new Map())
  const evictionVersionRef = useRef<Map<string, number>>(new Map())

  const getSnapshot = useCallback((bookId: string) => {
    return cacheRef.current.get(bookId)
  }, [])

  const hasSnapshot = useCallback((bookId: string) => {
    return cacheRef.current.has(bookId) || inflightRef.current.has(bookId)
  }, [])

  const updateSnapshot = useCallback((bookId: string, patch: Partial<BookSnapshot>) => {
    const current = cacheRef.current.get(bookId)
    if (!current) return
    cacheRef.current.set(bookId, {
      ...current,
      ...patch,
      fetchedAt: Date.now(),
    })
  }, [])

  const removeSnapshot = useCallback((bookId: string) => {
    cacheRef.current.delete(bookId)
    inflightRef.current.delete(bookId)
    evictionVersionRef.current.set(bookId, (evictionVersionRef.current.get(bookId) ?? 0) + 1)
  }, [])

  const loadSnapshot = useCallback((bookId: string): Promise<BookSnapshot> => {
    const inflight = inflightRef.current.get(bookId)
    if (inflight) return inflight

    const evictionVersion = evictionVersionRef.current.get(bookId) ?? 0
    const request = Promise.all([
      initBook(bookId),
      listLedgerEntries(bookId, { limit: 24 }).catch(() => ({ entries: [] as LedgerEntry[] })),
    ]).then(([snapshot, ledger]) => {
      if ((evictionVersionRef.current.get(bookId) ?? 0) !== evictionVersion) {
        throw new Error("书籍快照已失效")
      }
      const next: BookSnapshot = {
        ...snapshot,
        ledgerEntries: ledger.entries,
        fetchedAt: Date.now(),
      }
      cacheRef.current.set(bookId, next)
      return next
    }).finally(() => {
      if (inflightRef.current.get(bookId) === request) {
        inflightRef.current.delete(bookId)
      }
    })

    inflightRef.current.set(bookId, request)
    return request
  }, [])

  return {
    getSnapshot,
    hasSnapshot,
    loadSnapshot,
    updateSnapshot,
    removeSnapshot,
  }
}
