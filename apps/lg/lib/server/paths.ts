import path from "node:path"
import { getCurrentUserId } from "@/lib/server/request-context"

/**
 * Runtime data root. Defaults to `../../.lg-data` relative to the Next project root,
 * so that dev server file-watching does not pick up runtime writes.
 *
 * Override via the LG_DATA_DIR environment variable.
 */
export function getGlobalDataRoot(): string {
  if (process.env.LG_DATA_DIR) {
    return path.resolve(process.env.LG_DATA_DIR)
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), "..", "..", ".lg-data")
}

export function getDataRoot(): string {
  const userId = getCurrentUserId()
  return userId ? path.join(getGlobalDataRoot(), "users", userId) : getGlobalDataRoot()
}

export function getBooksRoot(): string {
  return path.join(getDataRoot(), "books")
}

export function getBookDir(bookId: string): string {
  return path.join(getBooksRoot(), bookId)
}

export function getIndexRoot(): string {
  return path.join(getDataRoot(), "index")
}
