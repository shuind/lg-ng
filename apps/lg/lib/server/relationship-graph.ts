import type { RelationshipGraph, RelationshipGraphEdge, RelationshipGraphNode } from "@/lib/types"
import { readBookFile } from "@/lib/server/book-store"

type RawStandardGraph = {
  nodes?: Array<{ id?: unknown; label?: unknown }>
  edges?: Array<{ source?: unknown; target?: unknown; label?: unknown }>
}

const RELATION_LABELS: Record<string, string> = {
  ally: "同盟",
  hostile: "敌对",
  enemy: "敌对",
  master: "师承",
  friend: "友方",
  family: "亲缘",
  love: "情感",
  rival: "竞争",
}

function normalizeLabel(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return "关联"
  return RELATION_LABELS[raw] ?? raw
}

function normalizeNodeLabel(id: string, label?: unknown): string {
  const explicit = typeof label === "string" ? label.trim() : ""
  if (explicit) return explicit
  return id.replace(/[-_]+/g, " ")
}

function splitLegacyKey(key: string): [string, string] | null {
  const separators = ["->", "--", "|", "_"]
  for (const separator of separators) {
    const index = key.indexOf(separator)
    if (index <= 0 || index >= key.length - separator.length) continue
    return [key.slice(0, index), key.slice(index + separator.length)]
  }
  return null
}

function addNode(nodes: Map<string, RelationshipGraphNode>, id: string, label?: unknown) {
  const normalized = id.trim()
  if (!normalized) return
  if (!nodes.has(normalized)) {
    nodes.set(normalized, { id: normalized, label: normalizeNodeLabel(normalized, label) })
  }
}

function parseStandardGraph(raw: RawStandardGraph): RelationshipGraph | null {
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null

  const nodes = new Map<string, RelationshipGraphNode>()
  for (const node of raw.nodes) {
    if (typeof node.id !== "string") continue
    addNode(nodes, node.id, node.label)
  }

  const edges: RelationshipGraphEdge[] = []
  for (const edge of raw.edges) {
    if (typeof edge.source !== "string" || typeof edge.target !== "string") continue
    addNode(nodes, edge.source)
    addNode(nodes, edge.target)
    edges.push({
      source: edge.source,
      target: edge.target,
      label: normalizeLabel(edge.label),
    })
  }

  return { nodes: Array.from(nodes.values()), edges }
}

function parseLegacyGraph(raw: Record<string, unknown>): RelationshipGraph {
  const nodes = new Map<string, RelationshipGraphNode>()
  const edges: RelationshipGraphEdge[] = []

  for (const [key, value] of Object.entries(raw)) {
    const pair = splitLegacyKey(key)
    if (!pair) continue
    const [source, target] = pair
    addNode(nodes, source)
    addNode(nodes, target)
    edges.push({ source, target, label: normalizeLabel(value) })
  }

  return { nodes: Array.from(nodes.values()), edges }
}

export async function getRelationshipGraph(bookId: string): Promise<RelationshipGraph> {
  const rawContent = await readBookFile(bookId, "关系图谱.json")
  if (!rawContent?.trim()) return { nodes: [], edges: [] }

  try {
    const raw = JSON.parse(rawContent)
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { nodes: [], edges: [] }

    const standard = parseStandardGraph(raw as RawStandardGraph)
    if (standard) return standard

    return parseLegacyGraph(raw as Record<string, unknown>)
  } catch {
    return { nodes: [], edges: [] }
  }
}
