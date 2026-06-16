"use client"

import { useState } from "react"
import { Brain } from "lucide-react"
import type { Message, Thread } from "@/lib/types"
import { MemoryDialog } from "./memory-dialog"
import { ExportMenu, ThreadMenu } from "./thread-menu"

export function ChatPanelHeader({
  bookId,
  bookTitle,
  activeThreadId,
  activeThread,
  messages,
  selectedTurnId,
  threads,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onSetThreadStatus,
}: {
  bookId: string
  bookTitle: string
  activeThreadId: string
  activeThread?: Thread
  messages: Message[]
  selectedTurnId: string | null
  threads: Thread[]
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
}) {
  const [memoryOpen, setMemoryOpen] = useState(false)
  const latestUsedMemory = [...messages].reverse().find((message) =>
    message.role === "assistant" && message.usedMemory && message.usedMemory.length > 0
  )?.usedMemory ?? []

  return (
    <header className="flex items-center justify-between px-8 pt-5 pb-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">当前书籍</div>
        <h1 className="font-serif text-xl tracking-wide text-foreground">{bookTitle}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMemoryOpen(true)}
          disabled={!bookId}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          title="Memory"
        >
          <Brain className="h-3.5 w-3.5" />
          Memory
        </button>
        <ExportMenu
          bookTitle={bookTitle}
          threadTitle={activeThread?.title ?? "任务线程"}
          messages={messages}
          selectedTurnId={selectedTurnId}
        />
        <ThreadMenu
          threads={threads}
          activeThread={activeThread}
          onCreateThread={onCreateThread}
          onSelectThread={onSelectThread}
          onRenameThread={onRenameThread}
          onSetThreadStatus={onSetThreadStatus}
        />
      </div>
      <MemoryDialog
        bookId={bookId}
        threadId={activeThreadId}
        usedMemory={latestUsedMemory}
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
      />
    </header>
  )
}
