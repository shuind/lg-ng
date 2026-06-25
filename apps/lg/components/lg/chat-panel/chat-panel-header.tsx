"use client"

import { useState } from "react"
import { Brain, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Message, Thread } from "@/lib/types"
import { MemoryDialog } from "./memory-dialog"
import { ExportMenu, ThreadMenu } from "./thread-menu"
import { ModelSelector } from "./model-selector"

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
    <header className="flex items-center justify-between gap-4 border-b border-border/50 px-4 pb-3 pt-4 md:px-8 md:pt-5">
      <div className="hidden min-w-0 md:block">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">当前书籍</div>
        <h1 className="truncate font-serif text-xl tracking-wide text-foreground">{bookTitle}</h1>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none [&>*]:shrink-0 md:overflow-visible">
        <ModelSelector />
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
        <span className="mx-1 h-5 w-px shrink-0 bg-border/60" aria-hidden="true" />
        <ExportMenu
          bookTitle={bookTitle}
          threadTitle={activeThread?.title ?? "任务线程"}
          messages={messages}
          selectedTurnId={selectedTurnId}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onCreateThread}
          disabled={!bookId}
          className="rounded-md border-border/60 bg-card/60 text-muted-foreground shadow-sm hover:bg-card hover:text-foreground"
          title="新建线程"
          aria-label="新建线程"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
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
