import path from "path"
import type { Message } from "@/lib/types"
import { appendJsonlFile, readJsonlFile } from "@/lib/server/jsonl"
import { getBookDir } from "@/lib/server/paths"
const MESSAGES_FILE = "messages.jsonl"

function messagesPath(bookId: string): string {
  return path.join(getBookDir(bookId), MESSAGES_FILE)
}

export async function listMessages(bookId: string): Promise<Message[]> {
  return readJsonlFile(messagesPath(bookId))
}

export async function appendMessage(bookId: string, message: Message): Promise<void> {
  await appendJsonlFile(messagesPath(bookId), [message])
}

export async function appendMessages(bookId: string, messages: Message[]): Promise<void> {
  await appendJsonlFile(messagesPath(bookId), messages)
}
