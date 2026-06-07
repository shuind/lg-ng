import type { LedgerListOptions, LedgerListResponse } from "../types"
import { delay } from "./common"

export async function listLedgerEntries(
  bookId: string,
  options: LedgerListOptions = {},
): Promise<LedgerListResponse> {
  try {
    const params = new URLSearchParams()
    if (typeof options.limit === "number") params.set("limit", String(options.limit))
    if (options.cursor) params.set("cursor", options.cursor)
    const query = params.toString()
    const res = await fetch(`/api/books/${bookId}/ledger${query ? `?${query}` : ""}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (Array.isArray(data)) return { entries: data }
    if (data && typeof data === "object" && Array.isArray(data.entries)) {
      return {
        entries: data.entries,
        nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : undefined,
      }
    }
    throw new Error("invalid")
  } catch {
    await delay()
    return { entries: [] }
  }
}

export async function rollbackLedgerEntry(bookId: string, entryId: string): Promise<{ updatedAt: string }> {
  const res = await fetch(`/api/books/${bookId}/ledger/${encodeURIComponent(entryId)}/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.error === "string" ? data.error : "回滚失败")
  }
  const data = await res.json()
  return { updatedAt: data.updatedAt ?? new Date().toISOString() }
}

// === Relationship Graph ===
