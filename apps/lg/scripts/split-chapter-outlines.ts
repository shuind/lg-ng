/**
 * Split legacy multi-chapter outline files into one file per chapter.
 *
 * Usage:
 *   pnpm --filter lg migrate:chapter-outlines
 *   pnpm --filter lg migrate:chapter-outlines -- --dry-run
 */
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import {
  isChapterOutlinePath,
  splitChapterOutlineDocument,
  validateChapterOutlineFile,
} from "../../../packages/novel-guide/src/novel/chapterOutline.js"

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

type BooksRoot = {
  label: string
  booksRoot: string
  indexBooksRoot: string
}

type MigrationStats = {
  scanned: number
  migrated: number
  written: number
  archived: number
}

function getDataRoot(): string {
  if (process.env.LG_DATA_DIR) return path.resolve(process.env.LG_DATA_DIR)
  return path.resolve(APP_ROOT, "..", "..", ".lg-data")
}

function isDryRun(): boolean {
  return process.argv.includes("--dry-run")
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target)
    return true
  } catch {
    return false
  }
}

async function listBooksRoots(dataRoot: string): Promise<BooksRoot[]> {
  const roots: BooksRoot[] = [{
    label: "global",
    booksRoot: path.join(dataRoot, "books"),
    indexBooksRoot: path.join(dataRoot, "index", "books"),
  }]

  const usersRoot = path.join(dataRoot, "users")
  const users = await fs.readdir(usersRoot, { withFileTypes: true }).catch(() => [])
  for (const user of users) {
    if (!user.isDirectory()) continue
    const userRoot = path.join(usersRoot, user.name)
    roots.push({
      label: `user:${user.name}`,
      booksRoot: path.join(userRoot, "books"),
      indexBooksRoot: path.join(userRoot, "index", "books"),
    })
  }

  return roots
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(abs)
      }
    }
  }

  await walk(root)
  return files
}

function toRel(bookDir: string, absPath: string): string {
  return path.relative(bookDir, absPath).replace(/\\/g, "/")
}

function archivePathFor(bookDir: string, relPath: string): string {
  const parsed = path.parse(relPath.replace(/\\/g, "/"))
  return path.join(bookDir, "archive", "plots", `${parsed.name}.legacy${parsed.ext || ".md"}`)
}

async function nextAvailablePath(target: string): Promise<string> {
  if (!(await pathExists(target))) return target
  const parsed = path.parse(target)
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`)
    if (!(await pathExists(candidate))) return candidate
  }
  throw new Error(`Cannot find available path for ${target}`)
}

async function writeIfNeeded(target: string, content: string, dryRun: boolean): Promise<boolean> {
  const finalTarget = await nextAvailablePath(target)
  if (dryRun) {
    console.log(`  would write ${finalTarget}`)
    return true
  }
  await fs.mkdir(path.dirname(finalTarget), { recursive: true })
  await fs.writeFile(finalTarget, content, "utf8")
  console.log(`  wrote ${finalTarget}`)
  return true
}

async function migrateBook(root: BooksRoot, bookId: string, dryRun: boolean, stats: MigrationStats): Promise<void> {
  const bookDir = path.join(root.booksRoot, bookId)
  const files = await walkMarkdownFiles(bookDir)

  for (const absFile of files) {
    const rel = toRel(bookDir, absFile)
    if (!isChapterOutlinePath(rel)) continue

    stats.scanned++
    const content = await fs.readFile(absFile, "utf8")
    const validation = validateChapterOutlineFile(rel, content)
    if (validation.ok) continue

    const split = splitChapterOutlineDocument(content, path.basename(absFile, ".md"))
    if (split.chapters.length <= 1) continue

    stats.migrated++
    console.log(`\n[${root.label}/${bookId}] ${rel}`)

    if (split.volume) {
      if (await writeIfNeeded(path.join(bookDir, "卷纲", split.volume.fileName), split.volume.content, dryRun)) {
        stats.written++
      }
    }

    for (const chapter of split.chapters) {
      if (await writeIfNeeded(path.join(bookDir, "章节大纲", chapter.fileName), chapter.content, dryRun)) {
        stats.written++
      }
    }

    const archivePath = await nextAvailablePath(archivePathFor(bookDir, rel))
    if (dryRun) {
      console.log(`  would archive ${absFile} -> ${archivePath}`)
    } else {
      await fs.mkdir(path.dirname(archivePath), { recursive: true })
      await fs.rename(absFile, archivePath)
      console.log(`  archived ${archivePath}`)
    }
    stats.archived++

    const indexDir = path.join(root.indexBooksRoot, bookId)
    if (dryRun) {
      console.log(`  would clear index ${indexDir}`)
    } else {
      await fs.rm(indexDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function main() {
  const dryRun = isDryRun()
  const dataRoot = getDataRoot()
  const roots = await listBooksRoots(dataRoot)
  const stats: MigrationStats = { scanned: 0, migrated: 0, written: 0, archived: 0 }

  console.log(`Data root: ${dataRoot}`)
  if (dryRun) console.log("Dry run: no files will be changed.")

  for (const root of roots) {
    if (!(await pathExists(root.booksRoot))) continue
    const books = await fs.readdir(root.booksRoot, { withFileTypes: true })
    for (const book of books) {
      if (!book.isDirectory()) continue
      await migrateBook(root, book.name, dryRun, stats)
    }
  }

  console.log("\nChapter outline migration complete:")
  console.log(`  scanned chapter outline files: ${stats.scanned}`)
  console.log(`  migrated legacy files: ${stats.migrated}`)
  console.log(`  written split files: ${stats.written}`)
  console.log(`  archived originals: ${stats.archived}`)
}

main().catch((err) => {
  console.error("Chapter outline migration failed:", err)
  process.exit(1)
})
