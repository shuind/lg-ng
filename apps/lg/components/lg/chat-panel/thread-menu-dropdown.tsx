"use client"

import { Archive, Check, Edit3, Plus, Trash2 } from "lucide-react"
import type { Thread } from "@/lib/mock-data"
import { ThreadMenuActionButton } from "./thread-menu-action-button"

export function ThreadMenuDropdown({
  activeThread,
  activeThreads,
  archivedThreads,
  onCreateThread,
  onSelectThread,
  onRenameCurrent,
  onArchiveCurrent,
  onDeleteCurrent,
  onRestoreThread,
}: {
  activeThread?: Thread
  activeThreads: Thread[]
  archivedThreads: Thread[]
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameCurrent: () => void
  onArchiveCurrent: () => void
  onDeleteCurrent: () => void
  onRestoreThread: (threadId: string) => void
}) {
  return (
    <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-border/70 bg-popover p-2 text-[12px] text-popover-foreground shadow-lg">
      <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Active Threads
      </div>
      <div className="max-h-48 overflow-y-auto">
        {activeThreads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelectThread(thread.id)}
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
          <div className="mt-2 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Archived
          </div>
          {archivedThreads.map((thread) => (
            <div key={thread.id} className="flex items-center gap-1 rounded-md px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{thread.title}</span>
              <button
                type="button"
                onClick={() => onRestoreThread(thread.id)}
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
        <ThreadMenuActionButton onClick={onCreateThread} icon={<Plus className="h-3.5 w-3.5" />}>
          新建
        </ThreadMenuActionButton>
        <ThreadMenuActionButton onClick={onRenameCurrent} icon={<Edit3 className="h-3.5 w-3.5" />}>
          重命名
        </ThreadMenuActionButton>
        <ThreadMenuActionButton
          onClick={onArchiveCurrent}
          icon={<Archive className="h-3.5 w-3.5" />}
          disabled={!activeThread}
        >
          归档
        </ThreadMenuActionButton>
        <ThreadMenuActionButton
          onClick={onDeleteCurrent}
          icon={<Trash2 className="h-3.5 w-3.5" />}
          disabled={!activeThread}
        >
          删除
        </ThreadMenuActionButton>
      </div>
    </div>
  )
}
