import fs from "fs/promises"
import path from "path"
import type { Chapter, ChapterContent } from "@/lib/types"
import { writeBookFile, readBookFile, getBookFileMtime } from "@/lib/server/book-store"
import { getBookDir } from "@/lib/server/paths"
import { listIndexedChapters } from "@/lib/server/book-index"

const CHAPTER_DIR = "章节正文"

function chapterPath(bookId: string, filename: string): string {
  return `${CHAPTER_DIR}/${filename}`
}

function chapterIdFromFilename(filename: string): string {
  return encodeURIComponent(filename.replace(/\.md$/, ""))
}

function filenameFromId(chapterId: string): string {
  return `${decodeURIComponent(chapterId)}.md`
}

function extractTitle(content: string, filename: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) return h1Match[1].trim()
  return filename.replace(/\.md$/, "")
}

export async function listChapters(bookId: string): Promise<Chapter[]> {
  return listIndexedChapters(bookId)
}

export async function createChapter(bookId: string, title?: string): Promise<Chapter> {
  const dir = path.join(getBookDir(bookId), CHAPTER_DIR)
  await fs.mkdir(dir, { recursive: true })

  // count existing chapters for index
  let existingCount = 0
  try {
    const entries = await fs.readdir(dir)
    existingCount = entries.filter((e) => e.endsWith(".md")).length
  } catch {
    // dir just created
  }

  const idx = existingCount + 1
  const chapterTitle = title?.trim() || `第${idx}章 · 未命名`

  // find unique filename
  let filename = `${chapterTitle}.md`
  let filePath = chapterPath(bookId, filename)
  let absPath = path.join(dir, filename)
  let suffix = 2
  try {
    while (await fileExists(absPath)) {
      filename = `${chapterTitle}-${suffix}.md`
      filePath = chapterPath(bookId, filename)
      absPath = path.join(dir, filename)
      suffix++
    }
  } catch {
    // file doesn't exist, good
  }

  const initialContent = `# ${chapterTitle}\n\n`
  await writeBookFile(bookId, filePath, initialContent)

  const mtime = await getBookFileMtime(bookId, filePath)

  return {
    id: chapterIdFromFilename(filename),
    bookId,
    title: chapterTitle,
    index: idx,
    wordCount: 0,
    status: "draft",
    path: filePath,
    updatedAt: mtime,
  }
}

export async function getChapter(bookId: string, chapterId: string): Promise<ChapterContent | null> {
  const filename = filenameFromId(chapterId)
  const filePath = chapterPath(bookId, filename)
  const content = await readBookFile(bookId, filePath)
  if (content === null) return null

  const mtime = await getBookFileMtime(bookId, filePath)
  const title = extractTitle(content, filename)

  return {
    id: chapterId,
    bookId,
    title,
    content,
    path: filePath,
    updatedAt: mtime,
  }
}

export async function saveChapter(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<ChapterContent | null> {
  const filename = filenameFromId(chapterId)
  const filePath = chapterPath(bookId, filename)

  // verify file exists
  const existing = await readBookFile(bookId, filePath)
  if (existing === null) return null

  await writeBookFile(bookId, filePath, content)

  const mtime = await getBookFileMtime(bookId, filePath)
  const title = extractTitle(content, filename)

  return {
    id: chapterId,
    bookId,
    title,
    content,
    path: filePath,
    updatedAt: mtime,
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}
