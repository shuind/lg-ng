import fs from "fs/promises"
import path from "path"
import type { LedgerEntry } from "@/lib/types"
import { markDirty } from "@/lib/server/dirty-index"
import { getBookDir } from "@/lib/server/paths"

function ledgerPath(bookId: string): string {
  return path.join(getBookDir(bookId), "ledger.jsonl")
}

export async function appendLedgerEntry(
  bookId: string,
  entry: Omit<LedgerEntry, "id" | "bookId" | "timestamp">,
): Promise<void> {
  const record: LedgerEntry = {
    id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    timestamp: new Date().toISOString(),
    ...entry,
  }

  const line = JSON.stringify(record) + "\n"
  await fs.appendFile(ledgerPath(bookId), line, "utf-8")
}

export async function listLedgerEntries(bookId: string): Promise<LedgerEntry[]> {
  const filePath = ledgerPath(bookId)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const lines = raw.trim().split("\n").filter(Boolean)
    const entries: LedgerEntry[] = []
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // skip malformed lines
      }
    }
    // newest first
    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  } catch {
    return []
  }
}

export async function getLedgerEntry(bookId: string, entryId: string): Promise<LedgerEntry | null> {
  const entries = await listLedgerEntries(bookId)
  return entries.find((entry) => entry.id === entryId) ?? null
}

async function updateBookTimestamp(bookDir: string) {
  try {
    const bookJsonPath = path.join(bookDir, "book.json")
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    meta.updatedAt = new Date().toISOString()
    await fs.writeFile(bookJsonPath, JSON.stringify(meta, null, 2), "utf-8")
  } catch {
    // best effort only
  }
}

export async function rollbackLedgerEntry(
  bookId: string,
  entryId: string,
): Promise<{ success: boolean; updatedAt?: string; error?: string }> {
  const entry = await getLedgerEntry(bookId, entryId)
  if (!entry) return { success: false, error: "ledger entry not found" }
  if (!entry.beforeSnapshot || !entry.targetPath) return { success: false, error: "entry is not rollbackable" }
  if (entry.targetPath === "ledger.jsonl") return { success: false, error: "cannot rollback ledger file" }

  const bookDir = getBookDir(bookId)
  const resolved = path.resolve(path.join(bookDir, entry.targetPath))
  if (!resolved.startsWith(bookDir)) return { success: false, error: "invalid target path" }

  let currentContent: string | undefined
  try {
    currentContent = await fs.readFile(resolved, "utf-8")
  } catch {
    // file may have been removed; rollback recreates it
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, entry.beforeSnapshot, "utf-8")
  await markDirty(bookId, entry.targetPath).catch(() => {})
  await updateBookTimestamp(bookDir)

  const updatedAt = new Date().toISOString()
  await appendLedgerEntry(bookId, {
    actor: "user",
    action: "rollback_file",
    targetPath: entry.targetPath,
    beforeSnapshot: currentContent,
    afterSnapshot: entry.beforeSnapshot,
    summary: `恢复 ${entry.targetPath} 到 ${new Date(entry.timestamp).toLocaleString("zh-CN")} 保存前`,
  })

  return { success: true, updatedAt }
}
