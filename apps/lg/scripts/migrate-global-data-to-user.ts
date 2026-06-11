/**
 * Move pre-auth global runtime data into one user's isolated data directory.
 *
 * Usage:
 *   pnpm migrate:global-user -- --email you@example.com
 *   LG_DATA_DIR=/data/lg pnpm migrate:global-user -- --email you@example.com
 */
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

type AuthDatabase = {
  users?: Array<{ id?: string; email?: string }>
}

function getDataRoot(): string {
  if (process.env.LG_DATA_DIR) return path.resolve(process.env.LG_DATA_DIR)
  return path.resolve(APP_ROOT, "..", "..", ".lg-data")
}

function readEmailArg(): string {
  const index = process.argv.indexOf("--email")
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error("Missing --email <user@example.com>")
  return value.trim().toLowerCase()
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target)
    return true
  } catch {
    return false
  }
}

async function readAuthDatabase(root: string): Promise<AuthDatabase> {
  const raw = await fs.readFile(path.join(root, "auth", "auth.json"), "utf8")
  return JSON.parse(raw) as AuthDatabase
}

async function copyIfPresent(root: string, userRoot: string, name: string): Promise<void> {
  const source = path.join(root, name)
  const target = path.join(userRoot, name)
  if (!(await pathExists(source))) {
    console.log(`Skip missing ${source}`)
    return
  }
  if (await pathExists(target)) {
    console.log(`Skip existing ${target}`)
    return
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.cp(source, target, { recursive: true, force: false, errorOnExist: true })
  console.log(`Copied ${source} -> ${target}`)
}

async function main() {
  const email = readEmailArg()
  const root = getDataRoot()
  const db = await readAuthDatabase(root)
  const user = db.users?.find((item) => item.email?.toLowerCase() === email)
  if (!user?.id) throw new Error(`User not found: ${email}`)

  const userRoot = path.join(root, "users", user.id)
  await copyIfPresent(root, userRoot, "books")
  await copyIfPresent(root, userRoot, "index")
  await copyIfPresent(root, userRoot, "app-settings.json")
  console.log(`Migration target user: ${email} (${user.id})`)
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
