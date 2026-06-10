import type { Message, Thread, Turn } from "../types"
import { readJsonResponse } from "./common"

export type ThreadBundle = {
  thread: Thread
  turns: Turn[]
  messages: Message[]
}

export async function createThread(bookId: string, title?: string): Promise<ThreadBundle> {
  const res = await fetch(`/api/books/${bookId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  return readJsonResponse<ThreadBundle>(res)
}

export async function forkThread(
  bookId: string,
  forkFrom: { threadId: string; turnId: string },
  title?: string,
): Promise<ThreadBundle> {
  const res = await fetch(`/api/books/${bookId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, forkFrom }),
  })
  return readJsonResponse<ThreadBundle>(res)
}

export async function getThread(bookId: string, threadId: string): Promise<ThreadBundle | null> {
  const res = await fetch(`/api/books/${bookId}/threads/${encodeURIComponent(threadId)}`, { cache: "no-store" })
  if (res.status === 404) return null
  return readJsonResponse<ThreadBundle>(res)
}

export async function updateThread(
  bookId: string,
  threadId: string,
  patch: { title?: string; status?: Thread["status"] },
): Promise<Thread | null> {
  const res = await fetch(`/api/books/${bookId}/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (res.status === 404) return null
  const data = await readJsonResponse<{ thread?: Thread }>(res)
  return data.thread ?? null
}

// === 设定卡片 ===
