"use client"

import { useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"
import type { WorkbenchFile } from "@/lib/types"

export function EditorPane({
  file,
  content,
  onChange,
  dirty,
  savedAt,
  initialLine,
}: {
  file: WorkbenchFile | null
  content: string
  onChange: (s: string) => void
  dirty: boolean
  savedAt: string
  initialLine?: number
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !initialLine || initialLine < 1 || !content) return

    const lines = content.split("\n")
    const lineIndex = Math.min(initialLine - 1, lines.length - 1)
    const start = lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0)
    const end = start + lines[lineIndex].length
    const style = window.getComputedStyle(textarea)
    const parsedLineHeight = Number.parseFloat(style.lineHeight)
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 28

    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(start, Math.max(start, end))
    textarea.scrollTop = Math.max(0, (lineIndex - 3) * lineHeight)
  }, [content, file?.path, initialLine])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 面包屑 */}
      <div className="flex shrink-0 items-center gap-2 px-10 pt-6 pb-3 text-[11px] text-muted-foreground">
        {file && (
          <>
            <span>{file.path.split("/").slice(0, -1).join(" / ")}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-mono text-foreground/80">{file.name}</span>
            <span className="ml-2 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[10px]">
              {dirty ? "未保存" : "已保存"}
            </span>
            <span className="ml-1 rounded-full bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/80">
              {savedAt} 修改
            </span>
          </>
        )}
      </div>

      {/* 编辑区 */}
      <div className="min-h-0 flex-1 overflow-hidden px-10 pb-12">
        <div className="paper mx-auto flex h-full max-w-3xl flex-col rounded-lg border border-border/60 bg-card/60 p-8 shadow-sm backdrop-blur">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="block min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent font-serif text-[15px] leading-[1.85] text-foreground outline-none scrollbar-thin"
          />
        </div>
      </div>
    </div>
  )
}
