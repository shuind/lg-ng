"use client"

import { ArrowLeft, Settings } from "lucide-react"

export function SidebarFooter({
  mode,
  onBackToChat,
}: {
  mode: "chat" | "writing" | "workbench"
  onBackToChat: () => void
}) {
  return (
    <div className="shrink-0 border-t border-border/60 bg-sidebar/40 px-3 py-3">
      {mode === "writing" ? (
        <button
          onClick={onBackToChat}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回对话
        </button>
      ) : (
        <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground">
          <Settings className="h-3.5 w-3.5" />
          设置
        </button>
      )}
    </div>
  )
}
