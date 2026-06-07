import {
  type Book,
  type Chapter,
  type Message,
  type OutlineFile,
  type SettingCard,
  type Thread,
  type Turn,
  mockBooks,
  mockChapters,
  mockMessages,
  mockSettingCards,
  mockThreads,
  mockTurns,
} from "../mock-data"
import type { ResponseConstraint } from "../types"
import { delay, fallbackResponseConstraints, relativeTime } from "./common"

export async function listBooks(): Promise<Book[]> {
  try {
    const res = await fetch("/api/books", { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty")
    return data.map((b: { id: string; title: string; updatedAt: string }) => ({
      id: b.id,
      title: b.title,
      updatedAt: relativeTime(b.updatedAt),
    }))
  } catch {
    await delay()
    return mockBooks
  }
}

export async function createBook(title?: string): Promise<Book> {
  try {
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title ?? "未命名书籍" }),
    })
    if (!res.ok) throw new Error("api failed")
    const b = await res.json()
    return { id: b.id, title: b.title, updatedAt: "刚刚" }
  } catch {
    await delay()
    return { id: `b${Date.now()}`, title: title ?? "未命名", updatedAt: "刚刚" }
  }
}

export async function renameBook(bookId: string, title: string): Promise<Book | null> {
  try {
    const res = await fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    const b = await res.json()
    return { id: b.id, title: b.title, updatedAt: relativeTime(b.updatedAt) }
  } catch {
    return null
  }
}

// === 初始化(合并请求) ===
export async function initBook(bookId: string): Promise<{
  chapters: Chapter[]
  outlines: OutlineFile[]
  messages: Message[]
  threads: Thread[]
  activeThreadId: string
  turns: Turn[]
  cards: SettingCard[]
  responseConstraints: ResponseConstraint[]
  threadConstraintIds: Record<string, string[]>
}> {
  try {
    const res = await fetch(`/api/books/${bookId}/init`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    const threads = Array.isArray(data.threads) ? data.threads : []
    const activeThreadId = typeof data.activeThreadId === "string" ? data.activeThreadId : threads[0]?.id ?? ""
    return {
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      outlines: Array.isArray(data.outlines) ? data.outlines : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      threads,
      activeThreadId,
      turns: Array.isArray(data.turns) ? data.turns : [],
      cards: Array.isArray(data.cards) ? data.cards : [],
      responseConstraints: Array.isArray(data.responseConstraints) ? data.responseConstraints : [],
      threadConstraintIds: data.threadConstraintIds && typeof data.threadConstraintIds === "object" ? data.threadConstraintIds : {},
    }
  } catch {
    await delay()
    const threads = mockThreads.filter((t) => t.bookId === bookId || bookId === "b1")
    return {
      chapters: mockChapters.filter((c) => c.bookId === bookId),
      outlines: [],
      messages: mockMessages,
      threads,
      activeThreadId: threads[0]?.id ?? "thread-mock",
      turns: mockTurns,
      cards: mockSettingCards,
      responseConstraints: fallbackResponseConstraints,
      threadConstraintIds: {},
    }
  }
}

// === 章节 ===
export async function listChapters(bookId: string): Promise<Chapter[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockChapters.filter((c) => c.bookId === bookId)
  }
}

export async function createChapter(bookId: string, title?: string): Promise<Chapter> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    const idx =
      mockChapters.filter((c) => c.bookId === bookId).reduce((m, c) => Math.max(m, c.index), 0) + 1
    return {
      id: `c${Date.now()}`,
      bookId,
      title: title ?? `第${idx}章 · 未命名`,
      index: idx,
      wordCount: 0,
      status: "draft",
      path: `章节正文/${title ?? `第${idx}章 · 未命名`}.md`,
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function getChapter(bookId: string, chapterId: string): Promise<{ id: string; title: string; content: string; path: string; updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return {
      id: chapterId,
      title: mockChapters.find((c) => c.id === chapterId)?.title ?? "",
      content: "",
      path: mockChapters.find((c) => c.id === chapterId)?.path ?? "",
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function saveChapter(bookId: string, chapterId: string, content: string): Promise<{ updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return { updatedAt: new Date().toISOString() }
  }
}

// === 对话 ===

export async function generateDraft(bookId: string, chapterId: string, prompt?: string): Promise<string> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return data.draft ?? "（试写）生成失败，请重试。"
  } catch {
    await delay(600)
    return "（试写）夜色压得人心头发沉。林晓提着剑,沿着回廊往内堂走去,廊下的灯一盏一盏地灭。"
  }
}

// === 工作台 ===
