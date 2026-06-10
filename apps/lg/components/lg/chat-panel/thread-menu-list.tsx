"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Thread } from "@/lib/types"
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
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameTitle, setRenameTitle] = useState("")
  const activeThreads = threads.filter((thread) => thread.status === "active")
  const archivedThreads = threads.filter((thread) => thread.status === "archived")

  function renameCurrent() {
    if (!activeThread) return
    setRenameTitle(activeThread.title)
    setRenameOpen(true)
  }

  function submitRename() {
    if (!activeThread) return
    const title = renameTitle.trim()
    if (!title) return
    onRenameThread(activeThread.id, title)
    setRenameOpen(false)
  }

  function submitDelete() {
    if (!activeThread) return
    onSetThreadStatus(activeThread.id, "deleted")
    setDeleteOpen(false)
  }

  function closeAndRun(callback: () => void) {
    setOpen(false)
    callback()
  }

  return (
    <>
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
              closeAndRun(() => setDeleteOpen(true))
            }}
            onRestoreThread={(threadId) => closeAndRun(() => onSetThreadStatus(threadId, "active"))}
          />
        )}
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名任务线程</DialogTitle>
            <DialogDescription>线程标题只影响当前书籍内的任务列表。</DialogDescription>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submitRename()
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRenameOpen(false)}>取消</Button>
            <Button type="button" disabled={!renameTitle.trim()} onClick={submitRename}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除任务线程</DialogTitle>
            <DialogDescription>
              {activeThread ? `确认删除「${activeThread.title}」？这个线程会从当前列表移除。` : "确认删除当前线程？"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>取消</Button>
            <Button type="button" variant="destructive" onClick={submitDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
