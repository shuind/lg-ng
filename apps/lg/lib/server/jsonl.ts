import fs from "fs/promises"
import path from "path"

export async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  try {
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
    return items
  } catch {
    return []
  }
}

export async function appendJsonlFile<T>(filePath: string, items: T[]): Promise<void> {
  if (items.length === 0) return
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf-8")
}

export async function writeJsonlFile<T>(filePath: string, items: T[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const body = items.length > 0 ? `${items.map((item) => JSON.stringify(item)).join("\n")}\n` : ""
  await fs.writeFile(filePath, body, "utf-8")
}
