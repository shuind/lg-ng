import type { MarkdownBlock } from "./markdown-types"

export function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: "code", text: codeLines.join("\n") })
      continue
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: "hr" })
      index += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] })
      index += 1
      continue
    }

    if (trimmed.startsWith(">")) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      blocks.push({ type: "blockquote", text: quote.join("\n") })
      continue
    }

    if (isTableStart(lines, index)) {
      const headers = parseTableRow(lines[index])
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: "table", headers, rows })
      continue
    }

    const listMatch = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
    if (listMatch) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
        if (!match || /^\s*\d+[.)]/.test(lines[index]) !== ordered) break
        items.push(match[1])
        index += 1
      }
      blocks.push({ type: "list", ordered, items })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !startsMarkdownBlock(lines, index)) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") })
  }

  return blocks
}

function startsMarkdownBlock(lines: string[], index: number): boolean {
  const trimmed = lines[index].trim()
  return Boolean(
    !trimmed ||
      trimmed.startsWith("```") ||
      trimmed.startsWith(">") ||
      /^---+$/.test(trimmed) ||
      /^(#{1,4})\s+/.test(trimmed) ||
      /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index]) ||
      isTableStart(lines, index),
  )
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(
    lines[index]?.includes("|") &&
      lines[index + 1] &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]),
  )
}

function parseTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1)
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1)
  return trimmed.split("|").map((cell) => cell.trim())
}
