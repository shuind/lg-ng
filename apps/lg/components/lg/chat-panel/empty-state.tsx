"use client"

import { Sparkles } from "lucide-react"

const SUGGESTIONS = [
  "帮我梳理主角的人物弧光",
  "为第一章补一个伏笔",
  "检查世界观设定是否自洽",
  "把这段对话改得更克制",
]

export function EmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <div className="surface-2 relative h-16 w-16 rounded-xl border animate-breathe">
        <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-accent-foreground/70" />
      </div>
      <div className="space-y-2">
        <h2 className="font-serif text-2xl tracking-wide text-foreground text-balance">系统 Agent 已就绪</h2>
        <p className="mx-auto max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          描述你想对世界观、人物、情节做的改动。涉及写入时，我会直接协作修改项目文件，并留下可追踪记录。
        </p>
      </div>
      <div className="flex max-w-md flex-wrap items-center justify-center gap-2 pt-1">
        {SUGGESTIONS.map((text) => (
          <span
            key={text}
            className="surface-1 rounded-full border px-3 py-1.5 text-[12px] text-muted-foreground"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}
