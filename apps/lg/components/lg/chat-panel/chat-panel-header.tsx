"use client"

import { ListChecks, Loader2 } from "lucide-react"
import type { Message, Thread } from "@/lib/types"
import { ExportMenu, ThreadMenu } from "./thread-menu"

export function ChatPanelHeader({
  bookTitle,
  activeThread,
  messages,
  selectedTurnId,
  threads,
  reviewing,
  onReview,
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
  reviewing: boolean
  onReview: () => Promise<void>
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
}) {
  return (
    <header className="flex items-center justify-between px-8 pt-5 pb-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">当前书籍</div>
        <h1 className="font-serif text-xl tracking-wide text-foreground">{bookTitle}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={reviewing}
          onClick={() => void onReview()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border/70 bg-background/55 px-2.5 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-45"
        >
          {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
          <span>体检</span>
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
    </header>
  )
}
