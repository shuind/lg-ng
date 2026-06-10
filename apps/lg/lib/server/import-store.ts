import fs from "fs/promises"
import path from "node:path"
import type { ImportedMaterial } from "@/lib/types"
import { getBookDir } from "@/lib/server/paths"
import { listIndexedFiles } from "@/lib/server/book-index"
import { readBookFile, writeBookFile } from "@/lib/server/book-store"
import { resolveInsideBook } from "@/lib/server/safe-paths"

export const IMPORT_MAX_FILES = 20
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024

const IMPORT_ROOT = "inbox"
const MATERIAL_LIST_LIMIT = 80
const SUPPORTED_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".yaml",
  ".yml",
  ".log",
])
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
])

export type ImportRejectedMaterial = {
  name: string
  reason: string
}

export type ImportMaterialInput = {
  name: string
  size: number
  content: string
}

export type ImportMaterialsResult = {
  imported: ImportedMaterial[]
  rejected: ImportRejectedMaterial[]
}

function todayFolder(): string {
  return new Date().toISOString().slice(0, 10)
}

function extensionOf(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase()
  return extension
}

function basenameWithoutExtension(fileName: string): string {
  const extension = path.extname(fileName)
  return extension ? fileName.slice(0, -extension.length) : fileName
}

function sanitizeFileName(rawName: string): string {
  const fallback = "material.txt"
  const baseName = rawName.replace(/\\/g, "/").split("/").pop()?.trim() || fallback
  const extension = extensionOf(baseName)
  const rawStem = basenameWithoutExtension(baseName)
  let stem = rawStem
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()

  if (!stem) stem = "material"
  if (WINDOWS_RESERVED_NAMES.has(stem.toLowerCase())) stem = `_${stem}`
  if (stem.length > 96) stem = stem.slice(0, 96).trim() || "material"

  return `${stem}${extension}`
}

function makeSummary(content: string, maxLen = 180): string {
  const compact = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  if (!compact) return "（空文件）"
  return compact.length > maxLen ? `${compact.slice(0, maxLen).trim()}...` : compact
}

async function fileExists(bookId: string, filePath: string): Promise<boolean> {
  const resolved = resolveInsideBook(bookId, filePath)
  if (!resolved) return false

  try {
    const stat = await fs.stat(resolved)
    return stat.isFile()
  } catch {
    return false
  }
}

async function nextAvailablePath(bookId: string, directory: string, fileName: string): Promise<string> {
  const extension = extensionOf(fileName)
  const stem = basenameWithoutExtension(fileName)
  let candidate = `${directory}/${fileName}`
  let suffix = 2

  while (await fileExists(bookId, candidate)) {
    candidate = `${directory}/${stem}-${suffix}${extension}`
    suffix += 1
  }

  return candidate
}

function toImportedMaterial(input: {
  name: string
  path: string
  summary: string
  size: number
  updatedAt: string
}): ImportedMaterial {
  return {
    id: `material:${input.path}`,
    name: input.name,
    path: input.path,
    summary: input.summary,
    size: input.size,
    updatedAt: input.updatedAt,
  }
}

export function validateImportFileName(name: string): string | null {
  const fileName = sanitizeFileName(name)
  const extension = extensionOf(fileName)
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return `仅支持 ${[...SUPPORTED_EXTENSIONS].join(", ")} 文本文件`
  }
  return null
}

export async function importTextMaterial(
  bookId: string,
  input: ImportMaterialInput,
): Promise<ImportedMaterial> {
  const fileName = sanitizeFileName(input.name)
  const directory = `${IMPORT_ROOT}/${todayFolder()}`
  const targetPath = await nextAvailablePath(bookId, directory, fileName)
  const ok = await writeBookFile(bookId, targetPath, input.content, {
    action: "import_file",
    summary: `导入材料 ${targetPath}`,
  })
  if (!ok) throw new Error(`导入失败：${input.name}`)

  const resolved = resolveInsideBook(bookId, targetPath)
  const updatedAt = resolved
    ? (await fs.stat(resolved).catch(() => null))?.mtime.toISOString() ?? new Date().toISOString()
    : new Date().toISOString()

  return toImportedMaterial({
    name: path.posix.basename(targetPath),
    path: targetPath,
    summary: makeSummary(input.content),
    size: input.size,
    updatedAt,
  })
}

export async function listImportedMaterials(bookId: string): Promise<ImportedMaterial[]> {
  const bookDir = getBookDir(bookId)
  const files = await listIndexedFiles(bookId)
  const materials = await Promise.all(
    files
      .filter((file) => file.path === IMPORT_ROOT || file.path.startsWith(`${IMPORT_ROOT}/`))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.path.localeCompare(b.path, "zh-CN"))
      .slice(0, MATERIAL_LIST_LIMIT)
      .map(async (file) => {
        const content = await readBookFile(bookId, file.path)
        const summary = content === null ? "（无法读取）" : makeSummary(content)
        const displayName = path.relative(bookDir, path.join(bookDir, ...file.path.split("/"))).replace(/\\/g, "/")
        return toImportedMaterial({
          name: file.name || path.posix.basename(displayName),
          path: file.path,
          summary,
          size: file.size,
          updatedAt: file.updatedAt,
        })
      }),
  )
  return materials
}
