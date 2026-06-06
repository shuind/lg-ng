import fs from "fs/promises"
import path from "path"
import type { Message } from "@/lib/types"
import { getBookDir } from "@/lib/server/paths"
const MESSAGES_FILE = "messages.jsonl"

function messagesPath(bookId: string): string {
  return path.join(getBookDir(bookId), MESSAGES_FILE)
}

export async function listMessages(bookId: string): Promise<Message[]> {
  const filePath = messagesPath(bookId)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const lines = raw.split("\n").filter((l) => l.trim())
    const messages: Message[] = []
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line))
      } catch {
        // skip bad line
      }
    }
    return messages
  } catch {
    return []
  }
}

export async function appendMessage(bookId: string, message: Message): Promise<void> {
  const filePath = messagesPath(bookId)
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  await fs.appendFile(filePath, JSON.stringify(message) + "\n", "utf-8")
}

export async function appendMessages(bookId: string, messages: Message[]): Promise<void> {
  if (messages.length === 0) return
  const filePath = messagesPath(bookId)
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n"
  await fs.appendFile(filePath, lines, "utf-8")
}
