import type { LedgerEntry } from "@/lib/types"

export function canDirectRollback(entry: LedgerEntry): boolean {
  return Boolean(
    entry.beforeSnapshot ||
      entry.diffPatch ||
      (entry.beforeHash && entry.beforeHash === entry.baseCheckpointHash),
  )
}
