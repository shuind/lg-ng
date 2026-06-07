"use client"

import { memo, useMemo } from "react"
import { cn } from "@/lib/utils"

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "hr" }

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content])

  return (
    <div className="space-y-3 break-words font-serif text-[15px] leading-[1.75] text-foreground">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  )
})

function parseMarkdown(content: string): MarkdownBlock[] {
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

function renderMarkdownBlock(block: MarkdownBlock, key: number) {
  switch (block.type) {
    case "heading": {
      const className = block.level === 1
        ? "mt-1 font-serif text-xl font-semibold leading-snug text-foreground"
        : block.level === 2
          ? "mt-4 font-serif text-lg font-semibold leading-snug text-foreground"
          : "mt-3 font-serif text-[16px] font-semibold leading-snug text-foreground"
      if (block.level === 1) return <h1 key={key} className={className}>{renderInline(block.text)}</h1>
      if (block.level === 2) return <h2 key={key} className={className}>{renderInline(block.text)}</h2>
      if (block.level === 3) return <h3 key={key} className={className}>{renderInline(block.text)}</h3>
      return <h4 key={key} className={className}>{renderInline(block.text)}</h4>
    }
    case "paragraph":
      return <p key={key}>{renderInlineWithBreaks(block.text)}</p>
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-2 border-primary/50 pl-3 text-foreground/85">
          {renderInlineWithBreaks(block.text)}
        </blockquote>
      )
    case "list": {
      const Tag = block.ordered ? "ol" : "ul"
      return (
        <Tag key={key} className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}
        </Tag>
      )
    }
    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded-md border border-border/60">
          <table className="min-w-full border-collapse text-left text-[13px] leading-relaxed">
            <thead className="bg-muted/60">
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index} className="border-b border-border/60 px-3 py-1.5 font-medium">
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border/40">
                  {block.headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-1.5 align-top">
                      {renderInline(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case "code":
      return (
        <pre key={key} className="overflow-x-auto rounded-md bg-muted/60 p-3 font-mono text-[12px] leading-relaxed">
          <code>{block.text}</code>
        </pre>
      )
    case "hr":
      return <div key={key} className="h-px bg-border/70" />
  }
}

function renderInlineWithBreaks(text: string) {
  return text.split("\n").flatMap((line, index) => (
    index === 0 ? renderInline(line) : [<br key={`br-${index}`} />, ...renderInline(line)]
  ))
}

function renderInline(text: string) {
  const nodes: React.ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`${match.index}-code`} className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.88em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(<strong key={`${match.index}-strong`} className="font-semibold">{token.slice(2, -2)}</strong>)
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
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
