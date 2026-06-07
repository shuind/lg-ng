"use client"

import { useState } from "react"
import type { Thread } from "@/lib/mock-data"
import { ThreadMenuDropdown } from "./thread-menu-dropdown"
import { ThreadMenuTrigger } from "./thread-menu-trigger"

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

  function closeAndRun(callback: () => void) {
    setOpen(false)
    callback()
  }

  return (
    <div className="relative">
      <ThreadMenuTrigger activeThread={activeThread} onToggle={() => setOpen((value) => !value)} />
      {open && (
        <ThreadMenuDropdown
          activeThread={activeThread}
          activeThreads={activeThreads}
          archivedThreads={archivedThreads}
          onCreateThread={() => closeAndRun(onCreateThread)}
          onSelectThread={(threadId) => closeAndRun(() => onSelectThread(threadId))}
          onRenameCurrent={() => closeAndRun(renameCurrent)}
          onArchiveCurrent={() => {
            if (!activeThread) return
            closeAndRun(() => onSetThreadStatus(activeThread.id, "archived"))
          }}
          onDeleteCurrent={() => {
            if (!activeThread) return
            if (!window.confirm(`删除线程「${activeThread.title}」？`)) return
            closeAndRun(() => onSetThreadStatus(activeThread.id, "deleted"))
          }}
          onRestoreThread={(threadId) => closeAndRun(() => onSetThreadStatus(threadId, "active"))}
        />
      )}
    </div>
  )
}
