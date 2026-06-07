"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import type { Message } from "@/lib/mock-data"
import {
  buildChatExportMarkdown,
  downloadMarkdown,
  formatFilenameDate,
  getExportMessages,
  sanitizeFilename,
} from "./export-markdown"

export type ExportMode = "simple" | "full"

export function ExportMenu({
  bookTitle,
  threadTitle,
  messages,
  selectedTurnId,
}: {
  bookTitle: string
  threadTitle: string
  messages: Message[]
  selectedTurnId: string | null
}) {
  const [open, setOpen] = useState(false)
  const exportMessages = getExportMessages(messages, selectedTurnId)
  const disabled = exportMessages.length === 0

  function handleExport(mode: ExportMode) {
    if (disabled) return
    const exportedAt = new Date()
    const markdown = buildChatExportMarkdown({
      bookTitle,
      threadTitle,
      messages: exportMessages,
      exportedAt,
      mode,
    })
    const stamp = formatFilenameDate(exportedAt)
    const suffix = mode === "full" ? "-完整信息" : ""
    const filename = sanitizeFilename(`${bookTitle || "未命名书籍"}-${threadTitle || "任务线程"}-${stamp}${suffix}.md`)
    downloadMarkdown(filename, markdown)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-card/60 text-muted-foreground ring-1 ring-border/60 backdrop-blur transition hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? "暂无可导出的对话" : "导出对话"}
        aria-label="导出对话"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 top-9 z-30 w-36 rounded-xl border border-border/70 bg-popover p-1.5 text-[12px] text-popover-foreground shadow-lg">
          <button
            type="button"
            onClick={() => handleExport("simple")}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left transition hover:bg-secondary"
          >
            导出对话
          </button>
          <button
            type="button"
            onClick={() => handleExport("full")}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left transition hover:bg-secondary"
          >
            导出完整信息
          </button>
        </div>
      )}
    </div>
  )
}
