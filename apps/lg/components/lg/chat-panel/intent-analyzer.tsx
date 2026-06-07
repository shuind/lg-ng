"use client"

import { Loader2 } from "lucide-react"

export function IntentAnalyzer() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border/50">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-[12px] text-foreground">LG 正在等待模型响应...</div>
        <div className="text-[10px] text-muted-foreground">
          真实工具调用和思考流会在消息气泡中出现。
        </div>
      </div>
    </div>
  )
}
