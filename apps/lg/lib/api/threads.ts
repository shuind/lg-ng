import type { Message, Thread, Turn } from "../mock-data"
import { delay } from "./common"

export type ThreadBundle = {
  thread: Thread
  turns: Turn[]
  messages: Message[]
}

export async function createThread(bookId: string, title?: string): Promise<ThreadBundle> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    const ts = new Date().toISOString()
    return {
      thread: {
        id: `thread-${Date.now()}`,
        bookId,
        title: title?.trim() || "新任务线程",
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      },
      turns: [],
      messages: [],
    }
  }
}

export async function forkThread(
  bookId: string,
  forkFrom: { threadId: string; turnId: string },
  title?: string,
): Promise<ThreadBundle> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, forkFrom }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    const ts = new Date().toISOString()
    return {
      thread: {
        id: `thread-${Date.now()}`,
        bookId,
        title: title?.trim() || "Branch",
        status: "active",
        branchFrom: forkFrom,
        createdAt: ts,
        updatedAt: ts,
      },
      turns: [],
      messages: [],
    }
  }
}

export async function getThread(bookId: string, threadId: string): Promise<ThreadBundle | null> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads/${encodeURIComponent(threadId)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return null
  }
}

export async function updateThread(
  bookId: string,
  threadId: string,
  patch: { title?: string; status?: Thread["status"] },
): Promise<Thread | null> {
  try {
    const res = await fetch(`/api/books/${bookId}/threads/${encodeURIComponent(threadId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return data.thread ?? null
  } catch {
    await delay()
    return null
  }
}

// === 设定卡片 ===
