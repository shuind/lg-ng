import fs from "fs/promises"
import path from "path"
import type { SettingCard } from "@/lib/types"
import { getBookDir } from "@/lib/server/paths"

async function readMdFiles(dir: string, basePath: string): Promise<{ name: string; path: string; content: string }[]> {
  try {
    const entries = await fs.readdir(dir)
    const files: { name: string; path: string; content: string }[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue
      try {
        const content = await fs.readFile(path.join(dir, entry), "utf-8")
        files.push({ name: entry.replace(/\.md$/, ""), path: `${basePath}/${entry}`, content })
      } catch {
        // skip unreadable
      }
    }
    return files
  } catch {
    return []
  }
}

function normalizeCardContent(content: string): string {
  return content.trim() || "（暂无内容）"
}

function extractSummary(content: string, maxLen = 180): string {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("---"))
  const text = lines.join(" ").replace(/\*\*|__|\*|_/g, "")
  const summary = text.length > maxLen ? `${text.slice(0, maxLen).trim()}...` : text.trim()
  return summary || "（暂无摘要）"
}

function extractMetaField(content: string, field: string): string | undefined {
  const re = new RegExp(`\\*\\*${field}\\*\\*[ 　]*(.+)`, "m")
  const match = content.match(re)
  return match ? match[1].trim().replace(/\s+.*$/, "") : undefined
}

function classifyWorldCard(name: string, content: string): SettingCard["category"] {
  const text = `${name}\n${content.slice(0, 500)}`
  if (/阵法|大阵|阵眼|阵纹|转轮阵|导灵阵|欺天大阵|阵\b/.test(text)) return "formation"
  if (/天轮|岁轮|灵气|雷劫|泄灵|潮汐|修仙界|天地|神魂|骨纹|印记/.test(text)) return "mechanism"
  if (/宗门|门派|青云宗|高层|老祖|杂役|势力|组织/.test(text)) return "faction"
  if (/地图|地域|地点|城|镇|山|谷|宗地|外山|矿区|地脉|灵脉/.test(text)) return "location"
  if (/规则|体系|法则|循环|心法|禁忌|约束/.test(text)) return "rule"
  return "other"
}

function displayWorldCardName(fileName: string, content: string): { name: string; sourceName?: string } {
  const genericName = /体系|系统|机制|设定|规则/.test(fileName)
  if (!genericName) return { name: fileName }

  const lines = content
    .split("\n")
    .map((item) => item.trim().replace(/^#+\s*/, ""))
    .filter((item) => item && !item.startsWith("---"))

  const match = lines
    .map((line) => line.match(/(?:核心机制|核心设定|机制|设定)[:：]\s*(.+)$/))
    .find((item): item is RegExpMatchArray => Boolean(item))
  const name = match?.[1]?.trim()
  if (!name || name === fileName) return { name: fileName }
  return { name, sourceName: fileName }
}

export async function listSettingCards(bookId: string): Promise<SettingCard[]> {
  const bookDir = getBookDir(bookId)
  const cards: SettingCard[] = []
  let idx = 0

  // character cards
  const characters = await readMdFiles(path.join(bookDir, "人物设定"), "人物设定")
  for (const f of characters) {
    const meta: Record<string, string> = {}
    const gender = extractMetaField(f.content, "性别")
    const identity = extractMetaField(f.content, "身份")
    const age = extractMetaField(f.content, "年龄")
    if (gender) meta["性别"] = gender
    if (identity) meta["身份"] = identity
    if (age) meta["年龄"] = age

    cards.push({
      id: `sc-${++idx}`,
      category: "character",
      name: f.name,
      summary: extractSummary(f.content),
      content: normalizeCardContent(f.content),
      path: f.path,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    })
  }

  // world cards
  const world = await readMdFiles(path.join(bookDir, "世界观"), "世界观")
  for (const f of world) {
    const displayName = displayWorldCardName(f.name, f.content)
    const meta = displayName.sourceName ? { 来源: displayName.sourceName } : undefined
    cards.push({
      id: `sc-${++idx}`,
      category: classifyWorldCard(f.name, f.content),
      name: displayName.name,
      summary: extractSummary(f.content),
      content: normalizeCardContent(f.content),
      path: f.path,
      meta,
    })
  }

  return cards
}
