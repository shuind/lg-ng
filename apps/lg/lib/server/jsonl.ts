import fs from "fs/promises"
import path from "path"

const MAX_JSONL_CACHE_SIZE = 64

type CachedJsonlFile = {
  mtimeMs: number
  items: unknown[]
}

const jsonlCache = new Map<string, CachedJsonlFile>()

function rememberJsonlFile<T>(filePath: string, mtimeMs: number, items: T[]): void {
  if (jsonlCache.has(filePath)) jsonlCache.delete(filePath)
  jsonlCache.set(filePath, { mtimeMs, items: items as unknown[] })
  while (jsonlCache.size > MAX_JSONL_CACHE_SIZE) {
    const oldestKey = jsonlCache.keys().next().value
    if (!oldestKey) break
    jsonlCache.delete(oldestKey)
  }
}

export async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  try {
    const stat = await fs.stat(filePath)
    const cached = jsonlCache.get(filePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.items as T[]
    }
    const raw = await fs.readFile(filePath, "utf-8")
    const items: T[] = []
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue
      try {
        items.push(JSON.parse(line) as T)
      } catch {
        // Ignore corrupt lines so one bad append does not hide valid records.
      }
    }
    rememberJsonlFile(filePath, stat.mtimeMs, items)
    return items
  } catch {
    return []
  }
}

export async function appendJsonlFile<T>(filePath: string, items: T[]): Promise<void> {
  if (items.length === 0) return
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf-8")
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat) return
  const cached = jsonlCache.get(filePath)
  if (cached) {
    rememberJsonlFile(filePath, stat.mtimeMs, [...cached.items, ...items])
  }
}

export async function writeJsonlFile<T>(filePath: string, items: T[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const body = items.length > 0 ? `${items.map((item) => JSON.stringify(item)).join("\n")}\n` : ""
  await fs.writeFile(filePath, body, "utf-8")
  const stat = await fs.stat(filePath).catch(() => null)
  if (stat) rememberJsonlFile(filePath, stat.mtimeMs, items)
}
