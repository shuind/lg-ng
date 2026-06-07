import fs from "fs/promises"
import path from "node:path"
import type { Dirent } from "node:fs"
import type { BookTreeNode, Chapter, OutlineFile, SettingCard } from "@/lib/types"
import { nowIso } from "@/lib/server/ids"
import { getBookDir, getIndexRoot } from "@/lib/server/paths"

const INDEX_VERSION = 1
const INDEX_VALIDATION_MAX_AGE_MS = 60_000
const CHAPTER_ROOTS = new Set(["章节正文", "chapters"])
const VOLUME_OUTLINE_ROOTS = new Set(["卷纲"])
const CHAPTER_OUTLINE_ROOTS = new Set(["章节大纲", "章纲", "outlines"])
const CHARACTER_ROOTS = new Set(["人物设定", "characters"])
const WORLD_ROOTS = new Set(["世界观", "settings"])

const HIDDEN_SEGMENTS = new Set([
  ".claude",
  ".lg-checkpoints",
  ".next",
  ".novel-guide",
  ".turbo",
  "node_modules",
])

const HIDDEN_FILE_NAMES = new Set([
  ".ds_store",
  ".gitkeep",
  "book.json",
  "ledger.jsonl",
  "messages.jsonl",
  "pending-action-plan.json",
  "proposals.jsonl",
  "response-constraints.json",
  "thread-messages.jsonl",
  "threads.json",
  "turns.jsonl",
])

type IndexEnvelope<T> = {
  version: number
  generatedAt: string
  validatedAt?: string
  items: T
}

type EnsureBookIndexOptions = {
  validateMtimes?: boolean
}

export type IndexedBookFile = {
  path: string
  name: string
  root: string
  extension: string
  updatedAt: string
  size: number
  hidden: boolean
}

function bookIndexDir(bookId: string): string {
  return path.join(getIndexRoot(), "books", bookId)
}

function fileIndexPath(bookId: string): string {
  return path.join(bookIndexDir(bookId), "file-index.json")
}

function chapterIndexPath(bookId: string): string {
  return path.join(bookIndexDir(bookId), "chapter-index.json")
}

function settingCardIndexPath(bookId: string): string {
  return path.join(bookIndexDir(bookId), "setting-card-index.json")
}

function isOlderThan(iso: string | undefined, maxAgeMs: number): boolean {
  if (!iso) return true
  const time = new Date(iso).getTime()
  return Number.isNaN(time) || Date.now() - time > maxAgeMs
}

function normalizeSlashPath(value: string): string {
  return value.replace(/\\/g, "/")
}

function splitPath(filePath: string): string[] {
  return normalizeSlashPath(filePath).split("/").filter(Boolean)
}

function pathRoot(filePath: string): string {
  return splitPath(filePath)[0] ?? ""
}

function fileNameFromPath(filePath: string): string {
  const parts = splitPath(filePath)
  return parts[parts.length - 1] ?? filePath
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".")
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ""
}

function isMarkdownPath(filePath: string): boolean {
  return fileExtension(fileNameFromPath(filePath)) === ".md"
}

function isHiddenPath(filePath: string): boolean {
  const segments = splitPath(filePath)
  if (segments.length === 0) return true
  if (segments.some((segment) => segment.startsWith("."))) return true
  if (segments.some((segment) => HIDDEN_SEGMENTS.has(segment.toLowerCase()))) return true
  return HIDDEN_FILE_NAMES.has(fileNameFromPath(filePath).toLowerCase())
}

async function readEnvelope<T>(filePath: string): Promise<IndexEnvelope<T> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const data = JSON.parse(raw) as Partial<IndexEnvelope<T>>
    if (data.version !== INDEX_VERSION || !data.items) return null
    return data as IndexEnvelope<T>
  } catch {
    return null
  }
}

async function writeEnvelope<T>(filePath: string, items: T): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const body: IndexEnvelope<T> = {
    version: INDEX_VERSION,
    generatedAt: nowIso(),
    validatedAt: nowIso(),
    items,
  }
  await fs.writeFile(filePath, JSON.stringify(body, null, 2), "utf-8")
}

async function statIndexedFile(bookId: string, filePath: string): Promise<IndexedBookFile | null> {
  const absPath = path.join(getBookDir(bookId), ...splitPath(filePath))
  try {
    const stat = await fs.stat(absPath)
    if (!stat.isFile()) return null
    const name = fileNameFromPath(filePath)
    return {
      path: normalizeSlashPath(filePath),
      name,
      root: pathRoot(filePath),
      extension: fileExtension(name),
      updatedAt: stat.mtime.toISOString(),
      size: stat.size,
      hidden: isHiddenPath(filePath),
    }
  } catch {
    return null
  }
}

async function scanBookFiles(bookId: string): Promise<IndexedBookFile[]> {
  const bookDir = getBookDir(bookId)
  const files: IndexedBookFile[] = []

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      const absPath = path.join(absDir, entry.name)
      if (entry.isDirectory()) {
        await walk(absPath, relPath)
        continue
      }
      if (!entry.isFile()) continue

      const indexed = await statIndexedFile(bookId, relPath)
      if (indexed) files.push(indexed)
    }
  }

  await walk(bookDir, "")
  return sortIndexedFiles(files)
}

function sortIndexedFiles(files: IndexedBookFile[]): IndexedBookFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path, "zh-CN", { numeric: true }))
}

function extractTitle(content: string, fallbackName: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m)
  return h1Match?.[1]?.trim() || fallbackName.replace(/\.md$/i, "")
}

function countWords(content: string): number {
  return content.replace(/\s/g, "").length
}

function statusFromWordCount(wordCount: number): "draft" | "writing" | "done" {
  return wordCount === 0 ? "draft" : "writing"
}

function chapterIdFromFilePath(filePath: string): string {
  return encodeURIComponent(fileNameFromPath(filePath).replace(/\.md$/i, ""))
}

function isChapterFile(filePath: string): boolean {
  return CHAPTER_ROOTS.has(pathRoot(filePath)) && isMarkdownPath(filePath)
}

function isSettingCardFile(filePath: string): boolean {
  return (CHARACTER_ROOTS.has(pathRoot(filePath)) || WORLD_ROOTS.has(pathRoot(filePath))) && isMarkdownPath(filePath)
}

function extractSummary(content: string, maxLen = 180): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("---"))
  const text = lines.join(" ").replace(/\*\*|__|\*|_/g, "")
  const summary = text.length > maxLen ? `${text.slice(0, maxLen).trim()}...` : text.trim()
  return summary || "（暂无摘要）"
}

function extractMetaField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`\\*\\*${field}\\*\\*[ 　]*(.+)`, "m"))
  return match ? match[1].trim().replace(/\s+.*$/, "") : undefined
}

function normalizeCardContent(content: string): string {
  return content.trim() || "（暂无内容）"
}

function classifyWorldCard(name: string, content: string): SettingCard["category"] {
  const text = `${name}\n${content.slice(0, 800)}`
  if (/阵|阵法|大阵/.test(text)) return "formation"
  if (/机制|体系|灵气|修仙|印记|法则/.test(text)) return "mechanism"
  if (/宗门|门派|组织|势力/.test(text)) return "faction"
  if (/地图|地点|地域|城|山|谷|宗地/.test(text)) return "location"
  if (/规则|禁忌|约束|规则体系/.test(text)) return "rule"
  return "other"
}

function displayWorldCardName(fileName: string, content: string): { name: string; sourceName?: string } {
  const genericName = /体系|系统|机制|设定|规则/.test(fileName)
  if (!genericName) return { name: fileName }

  const lines = content
    .split("\n")
    .map((item) => item.trim().replace(/^#+\s*/, ""))
    .filter((item) => item && !item.startsWith("---"))
  const match = lines
    .map((line) => line.match(/(?:核心机制|核心设定|机制|设定)[:：]\s*(.+)$/))
    .find((item): item is RegExpMatchArray => Boolean(item))
  const name = match?.[1]?.trim()
  if (!name || name === fileName) return { name: fileName }
  return { name, sourceName: fileName }
}

async function readIndexedFileContent(bookId: string, filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(getBookDir(bookId), ...splitPath(filePath)), "utf-8")
  } catch {
    return null
  }
}

async function toChapter(bookId: string, file: IndexedBookFile, index: number, content?: string): Promise<Chapter | null> {
  const text = content ?? await readIndexedFileContent(bookId, file.path)
  if (text === null) return null
  const wordCount = countWords(text)
  return {
    id: chapterIdFromFilePath(file.path),
    bookId,
    title: extractTitle(text, file.name),
    index,
    wordCount,
    status: statusFromWordCount(wordCount),
    path: file.path,
    updatedAt: file.updatedAt,
  }
}

async function toSettingCard(bookId: string, file: IndexedBookFile, sequence: number, content?: string): Promise<SettingCard | null> {
  const text = content ?? await readIndexedFileContent(bookId, file.path)
  if (text === null) return null

  const root = pathRoot(file.path)
  const fileBase = file.name.replace(/\.md$/i, "")
  if (CHARACTER_ROOTS.has(root)) {
    const meta: Record<string, string> = {}
    for (const field of ["性别", "身份", "年龄"]) {
      const value = extractMetaField(text, field)
      if (value) meta[field] = value
    }
    return {
      id: `sc-${sequence}`,
      category: "character",
      name: fileBase,
      summary: extractSummary(text),
      content: normalizeCardContent(text),
      path: file.path,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    }
  }

  const displayName = displayWorldCardName(fileBase, text)
  return {
    id: `sc-${sequence}`,
    category: classifyWorldCard(fileBase, text),
    name: displayName.name,
    summary: extractSummary(text),
    content: normalizeCardContent(text),
    path: file.path,
    meta: displayName.sourceName ? { 来源: displayName.sourceName } : undefined,
  }
}

async function buildChapterIndex(bookId: string, files: IndexedBookFile[]): Promise<Chapter[]> {
  const chapterFiles = files.filter((file) => isChapterFile(file.path))
  const chapters: Chapter[] = []
  for (let index = 0; index < chapterFiles.length; index++) {
    const chapter = await toChapter(bookId, chapterFiles[index], index + 1)
    if (chapter) chapters.push(chapter)
  }
  return chapters
}

async function buildSettingCardIndex(bookId: string, files: IndexedBookFile[]): Promise<SettingCard[]> {
  const settingFiles = files.filter((file) => isSettingCardFile(file.path))
  const cards: SettingCard[] = []
  for (const file of settingFiles) {
    const card = await toSettingCard(bookId, file, cards.length + 1)
    if (card) cards.push(card)
  }
  return cards
}

async function writeBookIndexesFromFiles(bookId: string, files: IndexedBookFile[]): Promise<void> {
  const [chapters, settingCards] = await Promise.all([
    buildChapterIndex(bookId, files),
    buildSettingCardIndex(bookId, files),
  ])
  await Promise.all([
    writeEnvelope(fileIndexPath(bookId), files),
    writeEnvelope(chapterIndexPath(bookId), chapters),
    writeEnvelope(settingCardIndexPath(bookId), settingCards),
  ])
}

export async function rebuildBookIndexes(bookId: string): Promise<void> {
  await writeBookIndexesFromFiles(bookId, await scanBookFiles(bookId))
}

function sameFileIndex(left: IndexedBookFile[], right: IndexedBookFile[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    const a = left[index]
    const b = right[index]
    if (
      a.path !== b.path ||
      a.updatedAt !== b.updatedAt ||
      a.size !== b.size ||
      a.hidden !== b.hidden
    ) {
      return false
    }
  }
  return true
}

export async function ensureBookIndexes(
  bookId: string,
  options: EnsureBookIndexOptions = {},
): Promise<void> {
  const validateMtimes = options.validateMtimes ?? true
  const [fileIndex, chapterIndex, settingCardIndex] = await Promise.all([
    readEnvelope<IndexedBookFile[]>(fileIndexPath(bookId)),
    readEnvelope<Chapter[]>(chapterIndexPath(bookId)),
    readEnvelope<SettingCard[]>(settingCardIndexPath(bookId)),
  ])

  if (
    fileIndex &&
    chapterIndex &&
    settingCardIndex
  ) {
    if (validateMtimes && isOlderThan(fileIndex.validatedAt, INDEX_VALIDATION_MAX_AGE_MS)) {
      const scannedFiles = await scanBookFiles(bookId)
      if (!sameFileIndex(fileIndex.items, scannedFiles)) {
        await writeBookIndexesFromFiles(bookId, scannedFiles)
        return
      }
      await Promise.all([
        writeEnvelope(fileIndexPath(bookId), fileIndex.items),
        writeEnvelope(chapterIndexPath(bookId), chapterIndex.items),
        writeEnvelope(settingCardIndexPath(bookId), settingCardIndex.items),
      ])
    }
    return
  }

  await rebuildBookIndexes(bookId)
}

async function readFilesIndex(bookId: string): Promise<IndexedBookFile[]> {
  await ensureBookIndexes(bookId)
  return (await readEnvelope<IndexedBookFile[]>(fileIndexPath(bookId)))?.items ?? []
}

async function readChapterIndex(bookId: string): Promise<Chapter[]> {
  await ensureBookIndexes(bookId)
  return (await readEnvelope<Chapter[]>(chapterIndexPath(bookId)))?.items ?? []
}

async function readSettingCardIndex(bookId: string): Promise<SettingCard[]> {
  await ensureBookIndexes(bookId)
  return (await readEnvelope<SettingCard[]>(settingCardIndexPath(bookId)))?.items ?? []
}

export async function listIndexedFiles(bookId: string, options: { includeHidden?: boolean } = {}): Promise<IndexedBookFile[]> {
  const files = await readFilesIndex(bookId)
  return options.includeHidden ? files : files.filter((file) => !file.hidden)
}

export async function getBookTreeFromIndex(bookId: string): Promise<BookTreeNode[]> {
  const files = await listIndexedFiles(bookId, { includeHidden: true })
  return buildTree(files.filter((file) => file.path !== "book.json"))
}

export async function listOutlineFilesFromIndex(bookId: string): Promise<OutlineFile[]> {
  const files = await listIndexedFiles(bookId, { includeHidden: true })
  const outlines = files.flatMap((file): OutlineFile[] => {
    const root = pathRoot(file.path)
    const isVolume = VOLUME_OUTLINE_ROOTS.has(root)
    const isChapter = CHAPTER_OUTLINE_ROOTS.has(root) || file.path.includes("章纲")
    if (!isVolume && !isChapter) return []
    return [{
      id: file.path,
      bookId,
      title: file.name.replace(/\.md$/i, ""),
      level: isVolume ? "volume" : "chapter",
      path: file.path,
      updatedAt: file.updatedAt,
    }]
  })
  return outlines.sort((a, b) => {
    if (a.level !== b.level) return a.level === "volume" ? -1 : 1
    return a.path.localeCompare(b.path, "zh-CN", { numeric: true })
  })
}

export async function listIndexedChapters(bookId: string): Promise<Chapter[]> {
  return readChapterIndex(bookId)
}

export async function listIndexedSettingCards(bookId: string): Promise<SettingCard[]> {
  return readSettingCardIndex(bookId)
}

function buildTree(files: IndexedBookFile[]): BookTreeNode[] {
  const root: BookTreeNode[] = []

  function ensureDirectory(children: BookTreeNode[], directoryPath: string, name: string): BookTreeNode {
    let node = children.find((item) => item.type === "directory" && item.path === directoryPath)
    if (!node) {
      node = { id: directoryPath, name, path: directoryPath, type: "directory", children: [] }
      children.push(node)
    }
    return node
  }

  for (const file of files) {
    const segments = splitPath(file.path)
    let children = root
    let currentPath = ""
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      const isFile = index === segments.length - 1
      if (isFile) {
        children.push({
          id: file.path,
          name: file.name,
          path: file.path,
          type: "file",
          updatedAt: file.updatedAt,
        })
      } else {
        const directory = ensureDirectory(children, currentPath, segment)
        children = directory.children ?? []
      }
    }
  }

  function sortNodes(nodes: BookTreeNode[]): BookTreeNode[] {
    return nodes
      .map((node) => node.type === "directory" ? { ...node, children: sortNodes(node.children ?? []) } : node)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1
        return a.name.localeCompare(b.name, "zh-CN", { numeric: true })
      })
  }

  return sortNodes(root)
}

export async function updateIndexedFile(bookId: string, filePath: string, content?: string): Promise<void> {
  await ensureBookIndexes(bookId, { validateMtimes: false })
  const normalizedPath = normalizeSlashPath(filePath)
  const indexed = await statIndexedFile(bookId, normalizedPath)
  if (!indexed) {
    await removeIndexedFile(bookId, normalizedPath)
    return
  }

  const [fileEnvelope, chapterEnvelope, cardEnvelope] = await Promise.all([
    readEnvelope<IndexedBookFile[]>(fileIndexPath(bookId)),
    readEnvelope<Chapter[]>(chapterIndexPath(bookId)),
    readEnvelope<SettingCard[]>(settingCardIndexPath(bookId)),
  ])
  const files = sortIndexedFiles([
    ...(fileEnvelope?.items ?? []).filter((file) => file.path !== normalizedPath),
    indexed,
  ])
  let chapters = (chapterEnvelope?.items ?? []).filter((chapter) => chapter.path !== normalizedPath)
  let cards = (cardEnvelope?.items ?? []).filter((card) => card.path !== normalizedPath)

  if (isChapterFile(normalizedPath)) {
    const chapterFiles = files.filter((file) => isChapterFile(file.path))
    const chapterIndex = chapterFiles.findIndex((file) => file.path === normalizedPath)
    const chapter = await toChapter(bookId, indexed, chapterIndex + 1, content)
    if (chapter) chapters = await buildChapterIndex(bookId, files)
  }

  if (isSettingCardFile(normalizedPath)) {
    const card = await toSettingCard(bookId, indexed, cards.length + 1, content)
    if (card) cards = await buildSettingCardIndex(bookId, files)
  }

  await Promise.all([
    writeEnvelope(fileIndexPath(bookId), files),
    writeEnvelope(chapterIndexPath(bookId), chapters),
    writeEnvelope(settingCardIndexPath(bookId), cards),
  ])
}

export async function removeIndexedFile(bookId: string, filePath: string): Promise<void> {
  await ensureBookIndexes(bookId, { validateMtimes: false })
  const normalizedPath = normalizeSlashPath(filePath)
  const [fileEnvelope, chapterEnvelope, cardEnvelope] = await Promise.all([
    readEnvelope<IndexedBookFile[]>(fileIndexPath(bookId)),
    readEnvelope<Chapter[]>(chapterIndexPath(bookId)),
    readEnvelope<SettingCard[]>(settingCardIndexPath(bookId)),
  ])
  const files = (fileEnvelope?.items ?? []).filter((file) => file.path !== normalizedPath)
  const chapters = (chapterEnvelope?.items ?? []).filter((chapter) => chapter.path !== normalizedPath)
  const cards = (cardEnvelope?.items ?? []).filter((card) => card.path !== normalizedPath)

  await Promise.all([
    writeEnvelope(fileIndexPath(bookId), files),
    writeEnvelope(chapterIndexPath(bookId), chapters),
    writeEnvelope(settingCardIndexPath(bookId), cards),
  ])
}
