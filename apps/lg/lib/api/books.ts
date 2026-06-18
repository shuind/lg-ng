import type { Book, Chapter, ImportedMaterial, Message, OutlineFile, SettingCard, Thread, Turn } from "../types"
import type { ResponseConstraint } from "../types"
import { readJsonResponse, relativeTime } from "./common"

type RawBook = {
  id: string
  title: string
  createdAt?: string
  updatedAt: string
  rootPath?: string
}

function normalizeBook(book: RawBook): Book {
  return {
    id: book.id,
    title: book.title,
    createdAt: book.createdAt ?? book.updatedAt,
    updatedAt: relativeTime(book.updatedAt),
    rootPath: book.rootPath ?? book.id,
  }
}

export async function listBooks(): Promise<Book[]> {
  const res = await fetch("/api/books", { cache: "no-store" })
  const data = await readJsonResponse<RawBook[]>(res)
  if (!Array.isArray(data)) throw new Error("书籍列表返回格式无效")
  return data.map(normalizeBook)
}

export async function createBook(title?: string): Promise<Book> {
  const res = await fetch("/api/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title ?? "未命名书籍" }),
  })
  const book = await readJsonResponse<RawBook>(res)
  return normalizeBook({ ...book, updatedAt: book.updatedAt ?? new Date().toISOString() })
}

export async function renameBook(bookId: string, title: string): Promise<Book> {
  const res = await fetch(`/api/books/${bookId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  const book = await readJsonResponse<RawBook>(res)
  return normalizeBook(book)
}

export async function deleteBook(bookId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/books/${bookId}`, {
    method: "DELETE",
  })
  return readJsonResponse(res)
}

export async function initBook(bookId: string): Promise<{
  chapters: Chapter[]
  outlines: OutlineFile[]
  messages: Message[]
  threads: Thread[]
  activeThreadId: string
  turns: Turn[]
  cards: SettingCard[]
  importedMaterials: ImportedMaterial[]
  responseConstraints: ResponseConstraint[]
  threadConstraintIds: Record<string, string[]>
}> {
  const res = await fetch(`/api/books/${bookId}/init`, { cache: "no-store" })
  const data = await readJsonResponse<{
    chapters?: unknown
    outlines?: unknown
    messages?: unknown
    threads?: unknown
    activeThreadId?: unknown
    turns?: unknown
    cards?: unknown
    importedMaterials?: unknown
    responseConstraints?: unknown
    threadConstraintIds?: unknown
  }>(res)
  const threads = Array.isArray(data.threads) ? data.threads as Thread[] : []
  return {
    chapters: Array.isArray(data.chapters) ? data.chapters as Chapter[] : [],
    outlines: Array.isArray(data.outlines) ? data.outlines as OutlineFile[] : [],
    messages: Array.isArray(data.messages) ? data.messages as Message[] : [],
    threads,
    activeThreadId: typeof data.activeThreadId === "string" ? data.activeThreadId : threads[0]?.id ?? "",
    turns: Array.isArray(data.turns) ? data.turns as Turn[] : [],
    cards: Array.isArray(data.cards) ? data.cards as SettingCard[] : [],
    importedMaterials: Array.isArray(data.importedMaterials) ? data.importedMaterials as ImportedMaterial[] : [],
    responseConstraints: Array.isArray(data.responseConstraints) ? data.responseConstraints as ResponseConstraint[] : [],
    threadConstraintIds: data.threadConstraintIds && typeof data.threadConstraintIds === "object"
      ? data.threadConstraintIds as Record<string, string[]>
      : {},
  }
}

export async function listChapters(bookId: string): Promise<Chapter[]> {
  const res = await fetch(`/api/books/${bookId}/chapters`, { cache: "no-store" })
  const data = await readJsonResponse<Chapter[]>(res)
  if (!Array.isArray(data)) throw new Error("章节列表返回格式无效")
  return data
}

export async function createChapter(bookId: string, title?: string): Promise<Chapter> {
  const res = await fetch(`/api/books/${bookId}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  return readJsonResponse<Chapter>(res)
}

export async function getChapter(
  bookId: string,
  chapterId: string,
): Promise<{ id: string; title: string; content: string; path: string; updatedAt: string }> {
  const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, { cache: "no-store" })
  return readJsonResponse(res)
}

export async function saveChapter(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<{ updatedAt: string }> {
  const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  return readJsonResponse(res)
}

export async function deleteChapter(bookId: string, chapterId: string): Promise<{ success: boolean; updatedAt: string }> {
  const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, {
    method: "DELETE",
  })
  return readJsonResponse(res)
}

export async function generateDraft(
  bookId: string,
  chapterId: string,
  prompt?: string,
  skillIds?: string[],
): Promise<string> {
  const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, skillIds }),
  })
  const data = await readJsonResponse<{ draft?: string }>(res)
  if (typeof data.draft !== "string") throw new Error("试写接口没有返回正文")
  return data.draft
}
