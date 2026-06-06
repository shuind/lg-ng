import type { BookTreeNode } from "@/lib/types"
import type { RetrievedContext } from "@/lib/types"
import { getDirtyFiles } from "@/lib/server/dirty-index"
import { getBookTree, readBookFile } from "@/lib/server/book-store"

const MAX_RESULTS = 5
const EXCERPT_LEN = 200

// files to skip unless explicitly queried
const SKIP_FILES = new Set([
  "ledger.jsonl",
  "pending-action-plan.json",
  "book.json",
  "messages.jsonl",
  "threads.json",
  "turns.jsonl",
  "thread-messages.jsonl",
  "proposals.jsonl",
])

// ─── Keyword Extraction ───────────────────────────────────────

const NAME_RE = /把\s*(.+?)\s*(?:改|换|变成?|和|跟|与)/g
const PATH_HINTS = [
  "创作指南", "关系图谱", "世界观", "人物设定", "卷纲", "章纲", "章节大纲", "章节", "skills",
  "剧情管理", "状态追踪", "读者体验", "写作约束", "章节摘要", "检查报告",
  "伏笔", "时间线", "位置", "信息差", "情绪", "爽点", "禁止项", "质量", "场景目标", "章节功能",
]

function extractKeywords(query: string): string[] {
  const keywords: string[] = []

  // extract character names from intent patterns
  let m: RegExpExecArray | null
  while ((m = NAME_RE.exec(query)) !== null) {
    const name = m[1].trim()
    if (name.length >= 2 && name.length <= 10) {
      keywords.push(name)
    }
  }

  // extract path hints
  for (const hint of PATH_HINTS) {
    if (query.includes(hint)) {
      keywords.push(hint)
    }
  }

  // also extract 2-4 char Chinese substrings as generic keywords
  const chineseRe = /[一-鿿]{2,4}/g
  let cm: RegExpExecArray | null
  while ((cm = chineseRe.exec(query)) !== null) {
    const word = cm[0]
    // skip common stopwords
    if (!["改成", "变成", "关系", "把", "和", "的", "改成", "请", "帮我", "一下"].includes(word)) {
      keywords.push(word)
    }
  }

  return [...new Set(keywords)]
}

function shouldIncludeRecentOnly(keywords: string[], dirtyCount: number): boolean {
  return keywords.length > 0 || dirtyCount > 0
}

// ─── Tree Flattening ──────────────────────────────────────────

interface FlatFile {
  path: string
  name: string
  updatedAt: string
}

function flattenTree(nodes: BookTreeNode[]): FlatFile[] {
  const files: FlatFile[] = []
  for (const node of nodes) {
    if (node.type === "directory" && node.children) {
      files.push(...flattenTree(node.children))
    } else if (node.type === "file") {
      files.push({ path: node.path, name: node.name, updatedAt: node.updatedAt ?? "" })
    }
  }
  return files
}

// ─── Excerpt Generation ───────────────────────────────────────

function makeExcerpt(content: string, keyword?: string): string {
  if (!content) return ""

  // if keyword found, center excerpt around first match
  if (keyword) {
    const idx = content.indexOf(keyword)
    if (idx >= 0) {
      const start = Math.max(0, idx - 60)
      const end = Math.min(content.length, idx + keyword.length + 140)
      let excerpt = content.slice(start, end).replace(/\n+/g, " ").trim()
      if (start > 0) excerpt = "…" + excerpt
      if (end < content.length) excerpt = excerpt + "…"
      return excerpt.slice(0, EXCERPT_LEN)
    }
  }

  // fallback: first 200 chars
  const flat = content.replace(/\n+/g, " ").trim()
  return flat.length > EXCERPT_LEN ? flat.slice(0, EXCERPT_LEN) + "…" : flat
}

// ─── Main Retrieval ───────────────────────────────────────────

export async function retrieveContext(bookId: string, query: string): Promise<RetrievedContext[]> {
  const keywords = extractKeywords(query)
  const dirtyEntries = await getDirtyFiles(bookId)
  if (!shouldIncludeRecentOnly(keywords, dirtyEntries.length)) {
    return []
  }

  const dirtyPaths = new Set(dirtyEntries.map((e) => e.path))
  const dirtyTimeMap = new Map(dirtyEntries.map((e) => [e.path, e.updatedAt]))

  // get all files in book
  const tree = await getBookTree(bookId)
  const allFiles = flattenTree(tree).filter((f) => !SKIP_FILES.has(f.name))

  // score each file — first pass: filename/path matching only (no I/O)
  const scored: { file: FlatFile; reason: RetrievedContext["reason"]; score: number }[] = []

  for (const file of allFiles) {
    let score = 0
    let reason: RetrievedContext["reason"] = "recent"

    if (dirtyPaths.has(file.path)) {
      score += 100
      reason = "dirty"
    }

    for (const kw of keywords) {
      if (file.name.includes(kw) || file.path.includes(kw)) {
        score += 50
        if (reason !== "dirty") reason = "keyword"
      }
    }

    if (file.updatedAt) {
      const age = Date.now() - new Date(file.updatedAt).getTime()
      if (age < 3600_000) score += 10
      else if (age < 86400_000) score += 5
    }

    if (score > 0) {
      scored.push({ file, reason, score })
    }
  }

  // also add dirty files that might not have scored
  for (const entry of dirtyEntries) {
    if (!scored.some((s) => s.file.path === entry.path) && !SKIP_FILES.has(entry.path.split("/").pop() ?? "")) {
      scored.push({
        file: { path: entry.path, name: entry.path.split("/").pop() ?? entry.path, updatedAt: entry.updatedAt },
        reason: "dirty",
        score: 100,
      })
    }
  }

  // second pass: only read content for files that didn't score by filename
  // and only if we don't already have enough results
  if (scored.length < MAX_RESULTS && keywords.length > 0) {
    const unscored = allFiles.filter(
      (f) => !scored.some((s) => s.file.path === f.path)
    )
    for (const file of unscored.slice(0, 20)) {
      try {
        const content = await readBookFile(bookId, file.path)
        if (content) {
          for (const kw of keywords) {
            if (content.includes(kw)) {
              scored.push({ file, reason: "keyword", score: 30 })
              break
            }
          }
        }
      } catch {
        // skip unreadable
      }
      if (scored.length >= MAX_RESULTS * 2) break
    }
  }

  // sort by score desc, then by updatedAt desc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.file.updatedAt ?? "").localeCompare(a.file.updatedAt ?? "")
  })

  // take top N and build results
  const top = scored.slice(0, MAX_RESULTS)
  const results: RetrievedContext[] = []

  for (let i = 0; i < top.length; i++) {
    const { file, reason, score } = top[i]
    let excerpt = ""
    try {
      const content = await readBookFile(bookId, file.path)
      if (content) {
        const matchedKw = keywords.find((kw) => file.name.includes(kw) || content.includes(kw))
        excerpt = makeExcerpt(content, matchedKw)
      }
    } catch {
      // unreadable
    }

    results.push({
      id: `rc-${i}`,
      bookId,
      path: file.path,
      reason,
      score,
      updatedAt: dirtyTimeMap.get(file.path) ?? file.updatedAt ?? "",
      excerpt,
    })
  }

  return results
}
