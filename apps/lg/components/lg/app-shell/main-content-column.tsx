"use client"

import { ChatPanel } from "@/components/lg/chat-panel"
import { WritingDesk } from "@/components/lg/writing-desk"
import type { AppShellProps } from "./types"

type MainContentColumnProps = Pick<
  AppShellProps,
  | "activeBookId"
  | "activeBookTitle"
  | "activeChapterId"
  | "activeThreadId"
  | "selectedTurnId"
  | "reviewing"
  | "messages"
  | "turns"
  | "threads"
  | "cards"
  | "mode"
  | "chatCitations"
  | "responseConstraints"
  | "activeResponseConstraintIds"
  | "onSelectTurn"
  | "onSend"
  | "onReview"
  | "onAddCitation"
  | "onRemoveCitation"
  | "onClearCitations"
  | "onCreateResponseConstraint"
  | "onUpdateResponseConstraint"
  | "onDeleteResponseConstraint"
  | "onSetActiveResponseConstraintIds"
  | "onCreateThread"
  | "onSelectThread"
  | "onRenameThread"
  | "onSetThreadStatus"
  | "onForkThread"
>

export function MainContentColumn({
  activeBookId,
  activeBookTitle,
  activeChapterId,
  activeThreadId,
  selectedTurnId,
  reviewing,
  messages,
  turns,
  threads,
  cards,
  mode,
  chatCitations,
  responseConstraints,
  activeResponseConstraintIds,
  onSelectTurn,
  onSend,
  onReview,
  onAddCitation,
  onRemoveCitation,
  onClearCitations,
  onCreateResponseConstraint,
  onUpdateResponseConstraint,
  onDeleteResponseConstraint,
  onSetActiveResponseConstraintIds,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onSetThreadStatus,
  onForkThread,
}: MainContentColumnProps) {
  return (
    <div className="relative min-h-0 min-w-0">
      {mode === "chat" ? (
        <ChatPanel
          bookId={activeBookId}
          bookTitle={activeBookTitle}
          messages={messages}
          turns={turns}
          threads={threads}
          activeThreadId={activeThreadId}
          selectedTurnId={selectedTurnId}
          reviewing={reviewing}
          citations={chatCitations}
          settingCards={cards}
          responseConstraints={responseConstraints}
          activeResponseConstraintIds={activeResponseConstraintIds}
          onSelectTurn={onSelectTurn}
          onSend={onSend}
          onReview={onReview}
          onAddCitation={onAddCitation}
          onRemoveCitation={onRemoveCitation}
          onClearCitations={onClearCitations}
          onCreateResponseConstraint={onCreateResponseConstraint}
          onUpdateResponseConstraint={onUpdateResponseConstraint}
          onDeleteResponseConstraint={onDeleteResponseConstraint}
          onSetActiveResponseConstraintIds={onSetActiveResponseConstraintIds}
          onCreateThread={onCreateThread}
          onSelectThread={onSelectThread}
          onRenameThread={onRenameThread}
          onSetThreadStatus={onSetThreadStatus}
          onForkThread={onForkThread}
        />
      ) : activeChapterId ? (
        <WritingDesk bookId={activeBookId} chapterId={activeChapterId} />
      ) : null}
    </div>
  )
}
