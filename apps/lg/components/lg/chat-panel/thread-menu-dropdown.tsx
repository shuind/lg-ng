"use client"

import { Archive, Check, Edit3, Plus, Trash2 } from "lucide-react"
import type { Thread } from "@/lib/types"
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
  onDeleteThread,
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
  onDeleteThread: (thread: Thread) => void
  onRestoreThread: (threadId: string) => void
}) {
  return (
    <div className="absolute right-0 top-9 z-30 w-72 rounded-lg border border-border/70 bg-popover p-2 text-[12px] text-popover-foreground shadow-lg">
      <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        活跃线程
      </div>
      <div className="max-h-48 overflow-y-auto">
        {activeThreads.map((thread) => (
          <div key={thread.id} className="group flex items-center rounded-md transition hover:bg-secondary focus-within:bg-secondary">
            <button
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
            >
              {thread.id === activeThread?.id ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
              <span className="min-w-0 flex-1 truncate">{thread.title}</span>
            </button>
            <button
              type="button"
              onClick={() => onDeleteThread(thread)}
              className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-100 transition hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              title="删除线程"
              aria-label={`删除线程：${thread.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {activeThreads.length === 0 && <div className="px-2 py-2 text-muted-foreground">暂无活跃线程</div>}
      </div>

      {archivedThreads.length > 0 && (
        <>
          <div className="mt-2 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            已归档
          </div>
          {archivedThreads.map((thread) => (
            <div key={thread.id} className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition hover:bg-secondary focus-within:bg-secondary">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{thread.title}</span>
              <button
                type="button"
                onClick={() => onRestoreThread(thread.id)}
                className="rounded px-1.5 py-0.5 text-[11px] transition hover:bg-background hover:text-foreground"
              >
                恢复
              </button>
              <button
                type="button"
                onClick={() => onDeleteThread(thread)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-100 transition hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                title="删除线程"
                aria-label={`删除线程：${thread.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
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