import path from "node:path"
import { getBookDir } from "@/lib/server/paths"

function resolveInside(parent: string, child: string): string {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(resolvedParent, child)
  const relative = path.relative(resolvedParent, resolvedChild)

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolvedChild
  }

  throw new Error(`Path escapes book directory: ${child}`)
}

export function resolveInsideBook(bookId: string, filePath: string): string | null {
  if (!filePath || path.isAbsolute(filePath)) return null

  try {
    return resolveInside(getBookDir(bookId), filePath)
  } catch {
    return null
  }
}
