"use client"

import type { Message, Thread } from "@/lib/mock-data"
import { ExportMenu, ThreadMenu } from "./thread-menu"

export function ChatPanelHeader({
  bookTitle,
  activeThread,
  messages,
  selectedTurnId,
  threads,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onSetThreadStatus,
}: {
  bookTitle: string
  activeThread?: Thread
  messages: Message[]
  selectedTurnId: string | null
  threads: Thread[]
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
}) {
  return (
    <header className="flex items-center justify-between px-8 pt-6 pb-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">当前书籍</div>
        <h1 className="font-serif text-xl tracking-wide text-foreground">{bookTitle}</h1>
      </div>
      <div className="flex items-center gap-2">
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
    </header>
  )
}
