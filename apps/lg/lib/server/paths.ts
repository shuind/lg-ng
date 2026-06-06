import path from "node:path"

/**
 * Runtime data root. Defaults to `../../.lg-data` relative to the Next project root,
 * so that dev server file-watching does not pick up runtime writes.
 *
 * Override via the LG_DATA_DIR environment variable.
 */
export function getDataRoot(): string {
  if (process.env.LG_DATA_DIR) {
    return path.resolve(process.env.LG_DATA_DIR)
  }
  return path.resolve(process.cwd(), "..", "..", ".lg-data")
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
