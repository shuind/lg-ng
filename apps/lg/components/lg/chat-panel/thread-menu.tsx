"use client"

import { useState } from "react"
import { Archive, Check, ChevronDown, Download, Edit3, Plus, Trash2 } from "lucide-react"
import type { Message, Thread } from "@/lib/mock-data"
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

export function ThreadMenu({
  threads,
  activeThread,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onSetThreadStatus,
}: {
  threads: Thread[]
  activeThread?: Thread
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
}) {
  const [open, setOpen] = useState(false)
  const activeThreads = threads.filter((thread) => thread.status === "active")
  const archivedThreads = threads.filter((thread) => thread.status === "archived")

  function renameCurrent() {
    if (!activeThread) return
    const title = window.prompt("重命名任务线程", activeThread.title)
    if (!title?.trim()) return
    onRenameThread(activeThread.id, title.trim())
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[260px] items-center gap-2 rounded-full bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground ring-1 ring-border/60 backdrop-blur transition hover:bg-card hover:text-foreground"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2 animate-pulse-dot" />
        <span className="truncate">{activeThread?.title ?? "任务线程"}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-border/70 bg-popover p-2 text-[12px] text-popover-foreground shadow-lg">
          <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active Threads</div>
          <div className="max-h-48 overflow-y-auto">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onSelectThread(thread.id)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-secondary"
              >
                {thread.id === activeThread?.id ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              </button>
            ))}
            {activeThreads.length === 0 && <div className="px-2 py-2 text-muted-foreground">暂无 active thread</div>}
          </div>
          {archivedThreads.length > 0 && (
            <>
              <div className="mt-2 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Archived</div>
              {archivedThreads.map((thread) => (
                <div key={thread.id} className="flex items-center gap-1 rounded-md px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{thread.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onSetThreadStatus(thread.id, "active")
                    }}
                    className="rounded px-1.5 py-0.5 text-[11px] transition hover:bg-secondary hover:text-foreground"
                  >
                    恢复
                  </button>
                </div>
              ))}
            </>
          )}
          <div className="my-2 h-px bg-border/70" />
          <div className="grid grid-cols-2 gap-1">
            <MenuButton
              onClick={() => {
                setOpen(false)
                onCreateThread()
              }}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              新建
            </MenuButton>
            <MenuButton
              onClick={() => {
                setOpen(false)
                renameCurrent()
              }}
              icon={<Edit3 className="h-3.5 w-3.5" />}
            >
              重命名
            </MenuButton>
            <MenuButton
              onClick={() => {
                if (!activeThread) return
                setOpen(false)
                onSetThreadStatus(activeThread.id, "archived")
              }}
              icon={<Archive className="h-3.5 w-3.5" />}
              disabled={!activeThread}
            >
              归档
            </MenuButton>
            <MenuButton
              onClick={() => {
                if (!activeThread) return
                if (!window.confirm(`删除线程「${activeThread.title}」？`)) return
                setOpen(false)
                onSetThreadStatus(activeThread.id, "deleted")
              }}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              disabled={!activeThread}
            >
              删除
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  )
}
