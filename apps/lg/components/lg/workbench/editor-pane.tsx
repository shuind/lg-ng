"use client"

import { ChevronRight } from "lucide-react"
import type { WorkbenchFile } from "@/lib/mock-data"

export function EditorPane({
  file,
  content,
  onChange,
  dirty,
  savedAt,
}: {
  file: WorkbenchFile | null
  content: string
  onChange: (s: string) => void
  dirty: boolean
  savedAt: string
}) {
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
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-10 pb-12">
        <div className="paper mx-auto max-w-3xl rounded-2xl border border-border/60 bg-card/60 p-8 shadow-sm backdrop-blur">
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="block min-h-[60vh] w-full resize-none border-0 bg-transparent font-serif text-[15px] leading-[1.85] text-foreground outline-none"
          />
        </div>
      </div>
    </div>
  )
}

