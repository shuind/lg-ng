import fs from "fs/promises"
import path from "path"
import type { Book, BookTreeNode, OutlineFile } from "@/lib/types"
import { clearDirty, clearDirtyBook, markDirty } from "@/lib/server/dirty-index"
import { appendLedgerEntry } from "@/lib/server/ledger"
import { withBookMutationQueue } from "@/lib/server/book-mutation-queue"
import { getBookDir, getBooksRoot, getIndexRoot } from "@/lib/server/paths"
import { resolveInsideBook } from "@/lib/server/safe-paths"
import { getBookTreeFromIndex, listOutlineFilesFromIndex, rebuildBookIndexes, removeIndexedFile, updateIndexedFile } from "@/lib/server/book-index"

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function dirExists(dir: string) {
  try {
    const stat = await fs.stat(dir)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

function resolveDirectChild(root: string, child: string): string | null {
  if (!child || path.isAbsolute(child) || child.includes("/") || child.includes("\\")) return null

  const resolvedRoot = path.resolve(root)
  const resolvedChild = path.resolve(resolvedRoot, child)
  const relative = path.relative(resolvedRoot, resolvedChild)

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return null
  return resolvedChild
}

export type WriteBookFileOptions = {
  action?: string
  summary?: string
}

export async function listBooks(): Promise<Book[]> {
  const booksRoot = getBooksRoot()
  if (!(await dirExists(booksRoot))) return []

  const entries = await fs.readdir(booksRoot, { withFileTypes: true })
  const books: Book[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const bookJsonPath = path.join(booksRoot, entry.name, "book.json")
    if (!(await fileExists(bookJsonPath))) continue

    try {
      const raw = await fs.readFile(bookJsonPath, "utf-8")
      const meta = JSON.parse(raw)
      books.push({
        id: meta.id ?? entry.name,
        title: meta.title ?? entry.name,
        createdAt: meta.createdAt ?? "",
        updatedAt: meta.updatedAt ?? "",
        rootPath: entry.name,
      })
    } catch {
      // skip broken book.json
    }
  }

  return books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getBook(bookId: string): Promise<Book | null> {
  const bookDir = getBookDir(bookId)
  const bookJsonPath = path.join(bookDir, "book.json")
  if (!(await fileExists(bookJsonPath))) return null

  try {
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    return {
      id: meta.id ?? bookId,
      title: meta.title ?? bookId,
      createdAt: meta.createdAt ?? "",
      updatedAt: meta.updatedAt ?? "",
      rootPath: bookId,
    }
  } catch {
    return null
  }
}

export async function createBook(title: string): Promise<Book> {
  const now = new Date().toISOString()
  const id = `${slugify(title)}-${Date.now().toString(36)}`
  const bookDir = getBookDir(id)

  // original directories
  await ensureDir(path.join(bookDir, "人物设定"))
  await ensureDir(path.join(bookDir, "世界观"))
  await ensureDir(path.join(bookDir, "卷纲"))
  await ensureDir(path.join(bookDir, "章节大纲"))
  await ensureDir(path.join(bookDir, "章节正文"))
  await ensureDir(path.join(bookDir, "skills"))
  // new system directories
  await ensureDir(path.join(bookDir, "剧情管理"))
  await ensureDir(path.join(bookDir, "状态追踪"))
  await ensureDir(path.join(bookDir, "读者体验"))
  await ensureDir(path.join(bookDir, "写作约束"))
  await ensureDir(path.join(bookDir, "章节摘要"))
  await ensureDir(path.join(bookDir, "检查报告"))
  await ensureDir(path.join(bookDir, "inbox"))

  const bookMeta = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
  }
  await fs.writeFile(path.join(bookDir, "book.json"), JSON.stringify(bookMeta, null, 2), "utf-8")
  await fs.writeFile(path.join(bookDir, "剧情设计指南.md"), `# 剧情设计指南\n\n（请在此整理本书的剧情设计方法：一句话故事、主角任务、动机、阻力、关卡、悬念和切入点。）\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "关系图谱.json"), "{}\n", "utf-8")
  await fs.writeFile(path.join(bookDir, "ledger.jsonl"), "", "utf-8")
  await fs.writeFile(path.join(bookDir, "messages.jsonl"), "", "utf-8")

  // system files — 剧情管理
  await fs.writeFile(path.join(bookDir, "剧情管理", "主线.md"), `# 主线\n\n记录主线剧情走向和核心矛盾。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "剧情管理", "支线.md"), `# 支线\n\n记录各支线剧情及其与主线的关联。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "剧情管理", "伏笔清单.md"), `# 伏笔清单\n\n记录所有已埋设和待回收的伏笔。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "剧情管理", "关键事件.md"), `# 关键事件\n\n记录推动剧情的关键事件节点。\n`, "utf-8")

  // 状态追踪
  await fs.writeFile(path.join(bookDir, "状态追踪", "时间线.md"), `# 时间线\n\n按故事内时间记录重大事件。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "状态追踪", "角色位置.md"), `# 角色位置\n\n追踪各角色在不同章节中的当前位置。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "状态追踪", "当前冲突.md"), `# 当前冲突\n\n记录当前章节中未解决的冲突和矛盾。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "状态追踪", "章节状态.md"), `# 章节状态\n\n记录各章节的写作状态和待办事项。\n`, "utf-8")

  // 读者体验
  await fs.writeFile(path.join(bookDir, "读者体验", "信息差.md"), `# 信息差\n\n追踪读者与角色之间的信息差。哪些信息读者已知但角色不知，反之亦然。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "读者体验", "情绪账户.md"), `# 情绪账户\n\n记录对读者的情绪承诺：哪些期待已被种下，哪些还需要兑现。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "读者体验", "爽点债务.md"), `# 爽点债务\n\n记录已承诺但尚未交付的爽点：复仇、逆袭、揭秘等。\n`, "utf-8")

  // 写作约束
  await fs.writeFile(path.join(bookDir, "写作约束", "禁止项.md"), `# 禁止项\n\n记录写作中应避免的套路、表达和模式。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "写作约束", "类型规则.md"), `# 类型规则\n\n记录本作品类型（武侠/玄幻/言情等）的写作规范。\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "写作约束", "质量约束.md"), `# 质量约束\n\n记录写作质量要求：词汇、节奏、描写比例等。\n`, "utf-8")

  await rebuildBookIndexes(id).catch(() => {})

  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    rootPath: id,
  }
}

export async function updateBookTitle(bookId: string, newTitle: string): Promise<Book | null> {
  const bookDir = getBookDir(bookId)
  const bookJsonPath = path.join(bookDir, "book.json")
  if (!(await fileExists(bookJsonPath))) return null

  try {
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    meta.title = newTitle
    meta.updatedAt = new Date().toISOString()
    await fs.writeFile(bookJsonPath, JSON.stringify(meta, null, 2), "utf-8")
    return {
      id: meta.id ?? bookId,
      title: meta.title,
      createdAt: meta.createdAt ?? "",
      updatedAt: meta.updatedAt,
      rootPath: bookId,
    }
  } catch {
    return null
  }
}

export async function deleteBook(bookId: string): Promise<boolean> {
  return withBookMutationQueue(bookId, async () => {
    const bookDir = resolveDirectChild(getBooksRoot(), bookId)
    if (!bookDir) return false

    const bookJsonPath = path.join(bookDir, "book.json")
    if (!(await fileExists(bookJsonPath))) return false

    const bookStat = await fs.stat(bookDir).catch(() => null)
    if (!bookStat?.isDirectory()) return false

    await fs.rm(bookDir, { recursive: true, force: false })

    const bookIndexDir = resolveDirectChild(path.join(getIndexRoot(), "books"), bookId)
    if (bookIndexDir) {
      await fs.rm(bookIndexDir, { recursive: true, force: true }).catch(() => {})
    }
    await clearDirtyBook(bookId).catch(() => {})

    return true
  })
}

export async function touchBookUpdatedAt(bookId: string): Promise<string> {
  const updatedAt = new Date().toISOString()
  const bookJsonPath = path.join(getBookDir(bookId), "book.json")
  try {
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    meta.updatedAt = updatedAt
    await fs.writeFile(bookJsonPath, JSON.stringify(meta, null, 2), "utf-8")
  } catch {
    // best effort only
  }
  return updatedAt
}

export async function getBookTree(bookId: string): Promise<BookTreeNode[]> {
  return getBookTreeFromIndex(bookId)
}

export async function listOutlineFiles(bookId: string): Promise<OutlineFile[]> {
  return listOutlineFilesFromIndex(bookId)
}

export async function readBookFile(bookId: string, filePath: string): Promise<string | null> {
  const resolved = resolveInsideBook(bookId, filePath)
  if (!resolved) return null

  try {
    return await fs.readFile(resolved, "utf-8")
  } catch {
    return null
  }
}

export async function getBookFileMtime(bookId: string, filePath: string): Promise<string> {
  const resolved = resolveInsideBook(bookId, filePath)
  if (!resolved) return new Date().toISOString()

  try {
    const stat = await fs.stat(resolved)
    return stat.mtime.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

export async function writeBookFile(
  bookId: string,
  filePath: string,
  content: string,
  options: WriteBookFileOptions = {},
): Promise<boolean> {
  return withBookMutationQueue(bookId, () => writeBookFileUnlocked(bookId, filePath, content, options))
}

async function writeBookFileUnlocked(
  bookId: string,
  filePath: string,
  content: string,
  options: WriteBookFileOptions = {},
): Promise<boolean> {
  const resolved = resolveInsideBook(bookId, filePath)
  if (!resolved) return false

  // read before snapshot (skip for ledger itself to avoid noise)
  const isLedgerFile = filePath === "ledger.jsonl"
  let beforeSnapshot: string | undefined
  if (!isLedgerFile) {
    try {
      beforeSnapshot = await fs.readFile(resolved, "utf-8")
    } catch {
      // file may not exist yet
    }
  }

  await ensureDir(path.dirname(resolved))
  await fs.writeFile(resolved, content, "utf-8")

  // mark dirty
  await markDirty(bookId, filePath).catch(() => {})

  // update book updatedAt
  await touchBookUpdatedAt(bookId)
  await updateIndexedFile(bookId, filePath, content).catch(() => {})

  // append ledger entry (skip for ledger.jsonl to avoid recursion)
  if (!isLedgerFile) {
    await appendLedgerEntry(bookId, {
      actor: "user",
      action: options.action ?? "write_file",
      targetPath: filePath,
      beforeSnapshot,
      afterSnapshot: content,
      summary: options.summary ?? `手动保存 ${filePath}`,
    }).catch(() => {})
  }

  return true
}

export async function deleteBookFile(bookId: string, filePath: string): Promise<boolean> {
  return withBookMutationQueue(bookId, async () => {
    const resolved = resolveInsideBook(bookId, filePath)
    if (!resolved || filePath === "ledger.jsonl") return false

    let beforeSnapshot: string
    try {
      const stat = await fs.stat(resolved)
      if (!stat.isFile()) return false
      beforeSnapshot = await fs.readFile(resolved, "utf-8")
    } catch {
      return false
    }

    await fs.unlink(resolved)
    await clearDirty(bookId, filePath).catch(() => {})
    await touchBookUpdatedAt(bookId)
    await removeIndexedFile(bookId, filePath).catch(() => {})
    await appendLedgerEntry(bookId, {
      actor: "user",
      action: "delete_file",
      targetPath: filePath,
      beforeSnapshot,
      summary: `Delete ${filePath}`,
    }).catch(() => {})

    return true
  })
}
