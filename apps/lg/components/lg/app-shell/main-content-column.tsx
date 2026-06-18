"use client"

import dynamic from "next/dynamic"
import { ChatPanel } from "@/components/lg/chat-panel/index"
import type { AppShellProps } from "./types"

const WritingDesk = dynamic(
  () => import("@/components/lg/writing-desk").then((mod) => mod.WritingDesk),
  { ssr: false },
)

type MainContentColumnProps = Pick<
  AppShellProps,
  | "activeBookId"
  | "activeBookTitle"
  | "activeChapterId"
  | "activeThreadId"
  | "selectedTurnId"
  | "turnBranchNavigation"
  | "messages"
  | "turns"
  | "threads"
  | "cards"
  | "importedMaterials"
  | "mode"
  | "chatCitations"
  | "responseConstraints"
  | "activeResponseConstraintIds"
  | "rollingBackLedgerEntryId"
  | "applyingProposalId"
  | "onSelectTurn"
  | "onSend"
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
  | "onSelectTurnBranch"
  | "onSubmitEditedTurn"
  | "onRollbackLedgerEntry"
  | "onApplyProposal"
  | "onDiscardProposal"
>

export function MainContentColumn({
  activeBookId,
  activeBookTitle,
  activeChapterId,
  activeThreadId,
  selectedTurnId,
  turnBranchNavigation,
  messages,
  turns,
  threads,
  cards,
  importedMaterials,
  mode,
  chatCitations,
  responseConstraints,
  activeResponseConstraintIds,
  rollingBackLedgerEntryId,
  applyingProposalId,
  onSelectTurn,
  onSend,
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
  onSelectTurnBranch,
  onSubmitEditedTurn,
  onRollbackLedgerEntry,
  onApplyProposal,
  onDiscardProposal,
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
          turnBranchNavigation={turnBranchNavigation}
          citations={chatCitations}
          settingCards={cards}
          importedMaterials={importedMaterials}
          responseConstraints={responseConstraints}
          activeResponseConstraintIds={activeResponseConstraintIds}
          rollingBackLedgerEntryId={rollingBackLedgerEntryId}
          applyingProposalId={applyingProposalId}
          onSelectTurn={onSelectTurn}
          onSend={onSend}
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
          onSelectTurnBranch={onSelectTurnBranch}
          onSubmitEditedTurn={onSubmitEditedTurn}
          onRollbackLedgerEntry={onRollbackLedgerEntry}
          onApplyProposal={onApplyProposal}
          onDiscardProposal={onDiscardProposal}
        />
      ) : activeChapterId ? (
        <WritingDesk bookId={activeBookId} chapterId={activeChapterId} />
      ) : null}
    </div>
  )
}
