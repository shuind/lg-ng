"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { MarkdownBlock } from "./markdown-types"

export function renderMarkdownBlock(block: MarkdownBlock, key: number) {
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
    index === 0
      ? renderInline(line, `line-${index}`)
      : [<br key={`br-${index}`} />, ...renderInline(line, `line-${index}`)]
  ))
}

function renderInline(text: string, keyPrefix = "inline") {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-${match.index}-code`} className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.88em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(<strong key={`${keyPrefix}-${match.index}-strong`} className="font-semibold">{token.slice(2, -2)}</strong>)
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
