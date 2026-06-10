/**
 * Migrate runtime data from apps/lg/data/ to the repo-level .lg-data/
 * directory (the default runtime data root).
 *
 * Usage:  pnpm data:migrate
 *         LG_DATA_DIR=/custom/path pnpm data:migrate
 *
 * Safe to run multiple times — skips if target already has data.
 */
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OLD_DATA_DIR = path.join(APP_ROOT, "data")

function getTargetRoot(): string {
  if (process.env.LG_DATA_DIR) {
    return path.resolve(process.env.LG_DATA_DIR)
  }
  return path.resolve(APP_ROOT, "..", "..", ".lg-data")
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function copyDir(src: string, dest: string): Promise<number> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  let count = 0

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
      count++
    }
  }

  return count
}

async function dirSize(dir: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      total += await dirSize(p)
    } else {
      const stat = await fs.stat(p)
      total += stat.size
    }
  }
  return total
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

async function main() {
  const targetRoot = getTargetRoot()

  console.log(`Old data dir: ${OLD_DATA_DIR}`)
  console.log(`New data dir: ${targetRoot}`)

  if (!(await dirExists(OLD_DATA_DIR))) {
    console.log("No old data/ directory found. Nothing to migrate.")
    return
  }

  // Check if target already has data
  if (await dirExists(targetRoot)) {
    const targetEntries = await fs.readdir(targetRoot)
    if (targetEntries.length > 0) {
      console.log(`Target directory already exists and is not empty. Skipping migration.`)
      console.log(`If you want to re-migrate, remove or rename: ${targetRoot}`)
      return
    }
  }

  // Count source files
  const oldSize = await dirSize(OLD_DATA_DIR)
  const oldEntries = await fs.readdir(OLD_DATA_DIR, { withFileTypes: true })
  const bookCount = oldEntries.filter((e) => e.isDirectory()).length

  console.log(`\nMigrating ${bookCount} book(s), ${formatBytes(oldSize)} total...`)

  const fileCount = await copyDir(OLD_DATA_DIR, targetRoot)

  console.log(`\nMigration complete:`)
  console.log(`  Files copied: ${fileCount}`)
  console.log(`  Target: ${targetRoot}`)
  console.log(`\nOld data/ directory is preserved. Remove it manually after verifying:`)
  console.log(`  Remove-Item -Recurse -Force "${OLD_DATA_DIR}"`)
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
