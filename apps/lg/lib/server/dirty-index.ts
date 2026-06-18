import fs from "fs/promises"
import path from "path"
import { getIndexRoot } from "@/lib/server/paths"

function getINDEX_DIR(): string {
  return getIndexRoot()
}

function getDIRTY_FILE(): string {
  return path.join(getINDEX_DIR(), "dirty-files.json")
}

export interface DirtyEntry {
  bookId: string
  path: string
  updatedAt: string
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function readDirtyFile(): Promise<DirtyEntry[]> {
  try {
    const raw = await fs.readFile(getDIRTY_FILE(), "utf-8")
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function writeDirtyFile(entries: DirtyEntry[]) {
  await ensureDir(getINDEX_DIR())
  await fs.writeFile(getDIRTY_FILE(), JSON.stringify(entries, null, 2), "utf-8")
}

export async function markDirty(bookId: string, filePath: string): Promise<void> {
  const entries = await readDirtyFile()
  const now = new Date().toISOString()
  const existing = entries.findIndex((e) => e.bookId === bookId && e.path === filePath)

  if (existing >= 0) {
    entries[existing].updatedAt = now
  } else {
    entries.push({ bookId, path: filePath, updatedAt: now })
  }

  await writeDirtyFile(entries)
}

export async function getDirtyFiles(bookId?: string): Promise<DirtyEntry[]> {
  const entries = await readDirtyFile()
  if (bookId) return entries.filter((e) => e.bookId === bookId)
  return entries
}

export async function clearDirty(bookId: string, filePath: string): Promise<void> {
  const entries = await readDirtyFile()
  const filtered = entries.filter((e) => !(e.bookId === bookId && e.path === filePath))
  await writeDirtyFile(filtered)
}

export async function clearDirtyBook(bookId: string): Promise<void> {
  const entries = await readDirtyFile()
  const filtered = entries.filter((e) => e.bookId !== bookId)
  await writeDirtyFile(filtered)
}
