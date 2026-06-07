"use client"

import { memo, useMemo } from "react"
import { parseMarkdown } from "./markdown-parser"
import { renderMarkdownBlock } from "./markdown-rendering"

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content])

  return (
    <div className="space-y-3 break-words font-serif text-[15px] leading-[1.75] text-foreground">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  )
})
