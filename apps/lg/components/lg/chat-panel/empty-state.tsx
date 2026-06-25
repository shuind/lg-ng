"use client"

import { LgMark } from "@/components/lg/brand/lg-mark"

export function EmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="surface-2 relative h-16 w-16 rounded-lg border animate-breathe">
        <LgMark className="absolute inset-0 m-auto h-7 w-7 text-accent-foreground/70" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-serif text-2xl tracking-wide text-foreground">系统 Agent 已就绪</h2>
        <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          描述你想对世界观、人物、情节做的改动。涉及写入时，我会直接协作修改项目文件，并留下可追踪记录。
        </p>
      </div>
    </div>
  )
}
