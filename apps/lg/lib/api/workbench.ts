import { type WorkbenchFile, type WorkbenchGroup, mockFileContent, mockWorkbenchTree } from "../mock-data"
import type { BookTreeNode, RelationshipGraph, RetrievedContext } from "../types"
import { delay } from "./common"

const workbenchGroupOrder = [
  "章节正文",
  "卷纲",
  "章节大纲",
  "章节摘要",
  "人物设定",
  "世界观",
  "剧情管理",
  "状态追踪",
  "读者体验",
  "写作约束",
  "检查报告",
  "定稿设定",
  "候选素材",
  "归档资料",
  "草稿箱",
  "收件箱",
  "项目文件",
  "其他",
  "系统文件",
]

const workbenchGroupByRoot: Record<string, string> = {
  data: "项目文件",
  章节正文: "章节正文",
  chapters: "章节正文",
  章节大纲: "章节大纲",
  章纲: "章节大纲",
  outlines: "章节大纲",
  章节摘要: "章节摘要",
  summaries: "章节摘要",
  卷纲: "卷纲",
  人物设定: "人物设定",
  characters: "人物设定",
  世界观: "世界观",
  settings: "世界观",
  剧情管理: "剧情管理",
  plots: "剧情管理",
  状态追踪: "状态追踪",
  timeline: "状态追踪",
  读者体验: "读者体验",
  reader: "读者体验",
  写作约束: "写作约束",
  constraints: "写作约束",
  检查报告: "检查报告",
  reports: "检查报告",
  canon: "定稿设定",
  candidates: "候选素材",
  archive: "归档资料",
  drafts: "草稿箱",
  inbox: "收件箱",
}

const workbenchSegmentLabels: Record<string, string> = {
  characters: "人物",
  settings: "设定",
  foreshadowing: "伏笔",
  timeline: "时间线",
  plots: "剧情",
  glossary: "术语表",
}

const hiddenWorkbenchSegments = new Set([
  ".claude",
  ".novel-guide",
  ".next",
  ".turbo",
  "node_modules",
  "skills",
])

const hiddenWorkbenchFileNames = new Set([
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

const hiddenWorkbenchExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".mp3",
  ".wav",
  ".mp4",
  ".mov",
  ".zip",
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".sqlite",
  ".db",
])

const systemWorkbenchFileNames = new Set([
  "claude.md",
  "novel.md",
  "创作指南.md",
  "关系图谱.json",
])

const systemWorkbenchRoots = new Set([
  "data",
])

function splitWorkbenchPath(filePath: string): string[] {
  return filePath.replace(/\\/g, "/").split("/").filter(Boolean)
}

function isHiddenWorkbenchPath(filePath: string): boolean {
  const segments = splitWorkbenchPath(filePath)
  if (segments.length === 0) return true
  if (segments.some((segment) => segment.startsWith("."))) return true
  if (segments.some((segment) => hiddenWorkbenchSegments.has(segment))) return true

  const fileName = segments[segments.length - 1].toLowerCase()
  if (hiddenWorkbenchFileNames.has(fileName)) return true

  const dotIndex = fileName.lastIndexOf(".")
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : ""
  return hiddenWorkbenchExtensions.has(extension)
}

function humanizeWorkbenchSegment(segment: string): string {
  const dotIndex = segment.lastIndexOf(".")
  const base = dotIndex > 0 ? segment.slice(0, dotIndex) : segment
  const extension = dotIndex > 0 ? segment.slice(dotIndex) : ""
  const label = workbenchSegmentLabels[base.toLowerCase()]
  return label ? `${label}${extension}` : segment
}

function toWorkbenchCategory(filePath: string): { label: string; name: string } | null {
  if (isHiddenWorkbenchPath(filePath)) return null

  const segments = splitWorkbenchPath(filePath)
  if (segments.length === 1) {
    if (systemWorkbenchFileNames.has(segments[0].toLowerCase())) {
      return { label: "系统文件", name: humanizeWorkbenchSegment(segments[0]) }
    }
    return { label: "项目文件", name: humanizeWorkbenchSegment(segments[0]) }
  }

  const [root, ...rest] = segments
  if (
    systemWorkbenchRoots.has(root.toLowerCase()) &&
    rest.length > 0 &&
    systemWorkbenchFileNames.has(rest[rest.length - 1].toLowerCase())
  ) {
    return { label: "系统文件", name: rest.map(humanizeWorkbenchSegment).join("/") }
  }

  const label = workbenchGroupByRoot[root] ?? "其他"
  const displaySegments = label === "其他" ? segments : rest
  return {
    label,
    name: displaySegments.map(humanizeWorkbenchSegment).join("/"),
  }
}

function sortWorkbenchFiles(files: WorkbenchFile[]): WorkbenchFile[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
}

export async function listWorkbenchTree(bookId: string): Promise<WorkbenchGroup[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/tree`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const nodes: BookTreeNode[] = await res.json()
    if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("empty")

    const groups = new Map<string, WorkbenchGroup>()

    function appendFile(node: BookTreeNode) {
      const category = toWorkbenchCategory(node.path)
      if (!category) return

      const existing = groups.get(category.label)
      const group = existing ?? { id: `workbench:${category.label}`, label: category.label, files: [] }
      group.files.push({ id: node.path, name: category.name, path: node.path })
      groups.set(category.label, group)
    }

    function visit(nodes: BookTreeNode[]) {
      for (const node of nodes) {
        if (node.type === "file") {
          appendFile(node)
        } else {
          visit(node.children ?? [])
        }
      }
    }

    visit(nodes)

    return [...groups.values()]
      .map((group) => ({ ...group, files: sortWorkbenchFiles(group.files) }))
      .sort((a, b) => {
        const ai = workbenchGroupOrder.indexOf(a.label)
        const bi = workbenchGroupOrder.indexOf(b.label)
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        return a.label.localeCompare(b.label, "zh-CN", { numeric: true })
      })
  } catch {
    await delay()
    return mockWorkbenchTree
  }
}

export async function readWorkbenchFile(bookId: string, path: string): Promise<{ content: string; updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (typeof data.content === "string") return { content: data.content, updatedAt: data.updatedAt ?? "" }
    throw new Error("no content")
  } catch {
    await delay()
    return { content: mockFileContent[path] ?? `# ${path}\n\n（暂无内容）`, updatedAt: "" }
  }
}

export async function writeWorkbenchFile(bookId: string, path: string, content: string): Promise<{ updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return { updatedAt: data.updatedAt ?? new Date().toISOString() }
  } catch {
    await delay()
    return { updatedAt: new Date().toISOString() }
  }
}

// === Ledger ===

export async function getRelationshipGraph(bookId: string): Promise<RelationshipGraph> {
  try {
    const res = await fetch(`/api/books/${bookId}/graph`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return { nodes: [], edges: [] }
  }
}

// === Retrieval ===
export async function retrieveContext(bookId: string, query: string): Promise<RetrievedContext[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return []
  }
}
