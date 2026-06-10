"use client"

import { memo, useDeferredValue, useMemo } from "react"
import { parseMarkdown } from "./markdown-parser"
import { renderMarkdownBlock } from "./markdown-rendering"

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const deferredContent = useDeferredValue(content)
  const blocks = useMemo(() => parseMarkdown(deferredContent), [deferredContent])

  return (
    <div className="space-y-4 break-words font-serif text-[15.5px] leading-[1.8] text-foreground">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  )
})
