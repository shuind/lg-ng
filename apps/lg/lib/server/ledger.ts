import fs from "fs/promises"
import crypto from "node:crypto"
import path from "path"
import { applyPatch, createTwoFilesPatch, formatPatch, parsePatch, reversePatch } from "diff"
import type { LedgerEntry, LedgerListOptions, LedgerListResponse } from "@/lib/types"
import { markDirty } from "@/lib/server/dirty-index"
import { withBookMutationQueue } from "@/lib/server/book-mutation-queue"
import { getBookDir, getIndexRoot } from "@/lib/server/paths"
import { resolveInsideBook } from "@/lib/server/safe-paths"
import { updateIndexedFile } from "@/lib/server/book-index"

const LEDGER_STATE_VERSION = 1
const CHECKPOINT_INTERVAL = 10
const DEFAULT_LEDGER_LIMIT = 50
const MAX_LEDGER_LIMIT = 200
const READ_CHUNK_BYTES = 64 * 1024

type LedgerAppendInput = Omit<
  LedgerEntry,
  | "id"
  | "bookId"
  | "timestamp"
  | "beforeHash"
  | "afterHash"
  | "diffPatch"
  | "fileRevision"
  | "baseCheckpointHash"
  | "baseCheckpointPath"
  | "checkpointHash"
  | "checkpointPath"
  | "checkpointReason"
> & {
  beforeSnapshot?: string
  afterSnapshot?: string
}

type LedgerTargetState = {
  latestRevision: number
  latestHash?: string
  latestCheckpointHash?: string
  latestCheckpointPath?: string
  entryCount: number
}

type LedgerState = {
  version: number
  updatedAt: string
  entryCount: number
  targets: Record<string, LedgerTargetState>
}

type ParsedLedgerLine = {
  entry: LedgerEntry
  offset: number
}

function ledgerPath(bookId: string): string {
  return path.join(getBookDir(bookId), "ledger.jsonl")
}

function ledgerStatePath(bookId: string): string {
  return path.join(getIndexRoot(), "books", bookId, "ledger-state.json")
}

function emptyLedgerState(): LedgerState {
  return {
    version: LEDGER_STATE_VERSION,
    updatedAt: new Date().toISOString(),
    entryCount: 0,
    targets: {},
  }
}

function sha256(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`
}

function checkpointRoot(bookId: string): string {
  return path.join(getBookDir(bookId), ".lg-checkpoints")
}

function checkpointPathForHash(bookId: string, hash: string): string {
  const digest = hash.replace(/^sha256:/, "")
  return path.join(checkpointRoot(bookId), digest.slice(0, 2), digest)
}

function checkpointDisplayPath(hash: string): string {
  const digest = hash.replace(/^sha256:/, "")
  return `.lg-checkpoints/${digest.slice(0, 2)}/${digest}`
}

async function ensureCheckpoint(bookId: string, content: string): Promise<{ hash: string; path: string }> {
  const hash = sha256(content)
  const filePath = checkpointPathForHash(bookId, hash)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.writeFile(filePath, content, { encoding: "utf-8", flag: "wx" })
  } catch (error) {
    if (!error || typeof error !== "object" || (error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error
    }
  }
  return { hash, path: checkpointDisplayPath(hash) }
}

async function readCheckpoint(bookId: string, hash: string): Promise<string | null> {
  try {
    return await fs.readFile(checkpointPathForHash(bookId, hash), "utf-8")
  } catch {
    return null
  }
}

function isContentWrite(entry: Pick<LedgerAppendInput, "targetPath" | "afterSnapshot">): boolean {
  return Boolean(entry.targetPath && typeof entry.afterSnapshot === "string")
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LEDGER_LIMIT
  return Math.max(1, Math.min(MAX_LEDGER_LIMIT, Math.trunc(limit ?? DEFAULT_LEDGER_LIMIT)))
}

function parseCursor(cursor: string | undefined, maxOffset: number): number {
  if (!cursor) return maxOffset
  const offset = Number.parseInt(cursor, 10)
  if (!Number.isFinite(offset)) return maxOffset
  return Math.max(0, Math.min(maxOffset, offset))
}

function normalizeEntryForState(entry: LedgerEntry): {
  revision?: number
  afterHash?: string
  checkpointHash?: string
  checkpointPath?: string
} {
  const afterHash = entry.afterHash ?? (
    typeof entry.afterSnapshot === "string" ? sha256(entry.afterSnapshot) : undefined
  )
  return {
    revision: entry.fileRevision,
    afterHash,
    checkpointHash: entry.checkpointHash,
    checkpointPath: entry.checkpointPath,
  }
}

function applyEntryToLedgerState(state: LedgerState, entry: LedgerEntry): void {
  state.entryCount += 1
  state.updatedAt = entry.timestamp || new Date().toISOString()

  if (!entry.targetPath) return

  const target = state.targets[entry.targetPath] ?? {
    latestRevision: 0,
    entryCount: 0,
  }
  target.entryCount += 1

  const normalized = normalizeEntryForState(entry)
  if (normalized.afterHash) {
    target.latestRevision = normalized.revision ?? target.latestRevision + 1
    target.latestHash = normalized.afterHash
  }

  if (normalized.checkpointHash && normalized.checkpointPath) {
    target.latestCheckpointHash = normalized.checkpointHash
    target.latestCheckpointPath = normalized.checkpointPath
  }

  state.targets[entry.targetPath] = target
}

async function writeLedgerState(bookId: string, state: LedgerState): Promise<void> {
  state.updatedAt = new Date().toISOString()
  const filePath = ledgerStatePath(bookId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8")
}

async function readLedgerState(bookId: string): Promise<LedgerState | null> {
  try {
    const raw = await fs.readFile(ledgerStatePath(bookId), "utf-8")
    const data = JSON.parse(raw) as Partial<LedgerState>
    if (data.version !== LEDGER_STATE_VERSION || !data.targets || typeof data.entryCount !== "number") {
      return null
    }
    return {
      version: LEDGER_STATE_VERSION,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
      entryCount: data.entryCount,
      targets: data.targets,
    }
  } catch {
    return null
  }
}

async function rebuildLedgerState(bookId: string): Promise<LedgerState> {
  const state = emptyLedgerState()
  try {
    const raw = await fs.readFile(ledgerPath(bookId), "utf-8")
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        applyEntryToLedgerState(state, JSON.parse(line) as LedgerEntry)
      } catch {
        // Skip malformed ledger lines; the append path will keep state valid from now on.
      }
    }
  } catch {
    // Missing ledger files are treated as empty ledgers.
  }
  await writeLedgerState(bookId, state)
  return state
}

async function readOrRebuildLedgerState(bookId: string): Promise<LedgerState> {
  return await readLedgerState(bookId) ?? await rebuildLedgerState(bookId)
}

function collectLinesFromBuffer(
  buffer: Buffer,
  absoluteStart: number,
  scanStart: number,
  collected: ParsedLedgerLine[],
  maxEntries: number,
): void {
  let lineEnd = buffer.length
  if (lineEnd > scanStart && buffer[lineEnd - 1] === 0x0a) lineEnd -= 1
  if (lineEnd > scanStart && buffer[lineEnd - 1] === 0x0d) lineEnd -= 1

  for (let index = lineEnd - 1; index >= scanStart - 1 && collected.length < maxEntries; index -= 1) {
    if (index >= scanStart && buffer[index] !== 0x0a) continue

    const lineStart = index < scanStart ? scanStart : index + 1
    let end = lineEnd
    if (end > lineStart && buffer[end - 1] === 0x0d) end -= 1

    if (end > lineStart) {
      const line = buffer.subarray(lineStart, end).toString("utf-8")
      try {
        collected.push({
          entry: JSON.parse(line) as LedgerEntry,
          offset: absoluteStart + lineStart,
        })
      } catch {
        // Skip malformed lines and keep paging.
      }
    }

    lineEnd = index
    if (lineEnd > scanStart && buffer[lineEnd - 1] === 0x0d) lineEnd -= 1
  }
}

async function readLedgerPageFromTail(
  bookId: string,
  options: LedgerListOptions = {},
): Promise<LedgerListResponse> {
  const limit = normalizeLimit(options.limit)
  const filePath = ledgerPath(bookId)
  let size = 0
  try {
    size = (await fs.stat(filePath)).size
  } catch {
    return { entries: [] }
  }

  const endOffset = parseCursor(options.cursor, size)
  if (endOffset <= 0) return { entries: [] }

  const collected: ParsedLedgerLine[] = []
  let position = endOffset
  let carry = Buffer.alloc(0)
  const handle = await fs.open(filePath, "r")

  try {
    while (position > 0 && collected.length < limit + 1) {
      const readSize = Math.min(READ_CHUNK_BYTES, position)
      const readStart = position - readSize
      const chunk = Buffer.alloc(readSize)
      const { bytesRead } = await handle.read(chunk, 0, readSize, readStart)
      const combined = Buffer.concat([chunk.subarray(0, bytesRead), carry])

      let scanStart = 0
      if (readStart > 0) {
        const firstNewline = combined.indexOf(0x0a)
        if (firstNewline === -1) {
          carry = combined
          position = readStart
          continue
        }
        carry = combined.subarray(0, firstNewline)
        scanStart = firstNewline + 1
      } else {
        carry = Buffer.alloc(0)
      }

      collectLinesFromBuffer(combined, readStart, scanStart, collected, limit + 1)
      position = readStart
    }
  } finally {
    await handle.close()
  }

  const page = collected.slice(0, limit)
  const nextCursor = collected.length > limit && page.length > 0
    ? String(page[page.length - 1].offset)
    : undefined

  return {
    entries: page.map((item) => item.entry),
    nextCursor,
  }
}

function tryReversePatch(entry: LedgerEntry, currentContent: string): string | null {
  if (!entry.diffPatch) return null
  try {
    const reverseDiff = formatPatch(reversePatch(parsePatch(entry.diffPatch)))
    const reversed = applyPatch(currentContent, reverseDiff, { fuzzFactor: 0 })
    if (reversed === false) return null
    if (entry.beforeHash && sha256(reversed) !== entry.beforeHash) return null
    return reversed
  } catch {
    return null
  }
}

export async function appendLedgerEntry(
  bookId: string,
  entry: LedgerAppendInput,
): Promise<LedgerEntry> {
  const state = await readOrRebuildLedgerState(bookId)
  const normalizedEntry: Omit<LedgerEntry, "id" | "bookId" | "timestamp"> = { ...entry }

  if (isContentWrite(entry)) {
    const before = entry.beforeSnapshot ?? ""
    const after = entry.afterSnapshot ?? ""
    const beforeHash = sha256(before)
    const afterHash = sha256(after)
    const previousTargetState = state.targets[entry.targetPath]
    const fileRevision = (previousTargetState?.latestRevision ?? 0) + 1
    const shouldCheckpoint = fileRevision === 1 || fileRevision % CHECKPOINT_INTERVAL === 0
    const checkpoint = shouldCheckpoint ? await ensureCheckpoint(bookId, after) : null

    normalizedEntry.beforeHash = beforeHash
    normalizedEntry.afterHash = afterHash
    normalizedEntry.diffPatch = createTwoFilesPatch(
      entry.targetPath,
      entry.targetPath,
      before,
      after,
      beforeHash,
      afterHash,
      { context: 3 },
    )
    normalizedEntry.fileRevision = fileRevision
    normalizedEntry.baseCheckpointHash = previousTargetState?.latestCheckpointHash
    normalizedEntry.baseCheckpointPath = previousTargetState?.latestCheckpointPath

    if (checkpoint) {
      normalizedEntry.checkpointHash = checkpoint.hash
      normalizedEntry.checkpointPath = checkpoint.path
      normalizedEntry.checkpointReason = "interval"
    }

    delete normalizedEntry.beforeSnapshot
    delete normalizedEntry.afterSnapshot
  }

  const record: LedgerEntry = {
    id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    timestamp: new Date().toISOString(),
    ...normalizedEntry,
  }

  await fs.appendFile(ledgerPath(bookId), JSON.stringify(record) + "\n", "utf-8")
  applyEntryToLedgerState(state, record)
  await writeLedgerState(bookId, state)
  return record
}

export async function listLedgerEntries(
  bookId: string,
  options: LedgerListOptions = {},
): Promise<LedgerListResponse> {
  return readLedgerPageFromTail(bookId, options)
}

export async function getLedgerEntry(bookId: string, entryId: string): Promise<LedgerEntry | null> {
  let cursor: string | undefined
  do {
    const page = await listLedgerEntries(bookId, { limit: 100, cursor })
    const entry = page.entries.find((item) => item.id === entryId)
    if (entry) return entry
    cursor = page.nextCursor
  } while (cursor)
  return null
}

async function updateBookTimestamp(bookDir: string) {
  try {
    const bookJsonPath = path.join(bookDir, "book.json")
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    meta.updatedAt = new Date().toISOString()
    await fs.writeFile(bookJsonPath, JSON.stringify(meta, null, 2), "utf-8")
  } catch {
    // Best effort only.
  }
}

export async function rollbackLedgerEntry(
  bookId: string,
  entryId: string,
): Promise<{ success: boolean; updatedAt?: string; error?: string }> {
  return withBookMutationQueue(bookId, () => rollbackLedgerEntryUnlocked(bookId, entryId))
}

async function rollbackLedgerEntryUnlocked(
  bookId: string,
  entryId: string,
): Promise<{ success: boolean; updatedAt?: string; error?: string }> {
  const entry = await getLedgerEntry(bookId, entryId)
  if (!entry) return { success: false, error: "ledger entry not found" }
  if (!entry.targetPath) return { success: false, error: "entry is not rollbackable" }
  if (entry.targetPath === "ledger.jsonl") return { success: false, error: "cannot rollback ledger file" }

  const bookDir = getBookDir(bookId)
  const resolved = resolveInsideBook(bookId, entry.targetPath)
  if (!resolved) return { success: false, error: "invalid target path" }

  let currentContent: string | undefined
  try {
    currentContent = await fs.readFile(resolved, "utf-8")
  } catch {
    // File may have been removed; rollback can recreate it if we have a snapshot.
  }

  if (entry.afterHash && sha256(currentContent ?? "") !== entry.afterHash) {
    return {
      success: false,
      error: "file changed after this ledger entry; restore manually from history or ask the agent to reconstruct it",
    }
  }

  let rollbackContent: string | null = null
  if (entry.beforeHash) {
    rollbackContent = await readCheckpoint(bookId, entry.beforeHash)
  }
  if (rollbackContent === null && entry.beforeSnapshot) {
    rollbackContent = entry.beforeSnapshot
  }
  if (rollbackContent === null && currentContent !== undefined) {
    rollbackContent = tryReversePatch(entry, currentContent)
  }
  if (rollbackContent === null) {
    return {
      success: false,
      error: "this entry has no checkpoint for direct rollback; use the diff history to reconstruct the earlier version",
    }
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, rollbackContent, "utf-8")
  await markDirty(bookId, entry.targetPath).catch(() => {})
  await updateBookTimestamp(bookDir)
  await updateIndexedFile(bookId, entry.targetPath, rollbackContent).catch(() => {})

  const updatedAt = new Date().toISOString()
  await appendLedgerEntry(bookId, {
    actor: "user",
    action: "rollback_file",
    targetPath: entry.targetPath,
    beforeSnapshot: currentContent,
    afterSnapshot: rollbackContent,
    summary: `Rollback ${entry.targetPath} to before ${entry.timestamp}`,
  })

  return { success: true, updatedAt }
}
