"use client"

import { LeftSidebarColumn } from "./app-shell/left-sidebar-column"
import { MainContentColumn } from "./app-shell/main-content-column"
import { RightSidebarColumn } from "./app-shell/right-sidebar-column"
import type { AppMode, AppShellProps } from "./app-shell/types"
import { WorkbenchOverlay } from "./app-shell/workbench-overlay"
import { WorkbenchOpenProvider } from "./workbench-open-context"

export type { AppMode }

export function AppShell(props: AppShellProps) {
  const gridCols = props.collapsed
    ? "grid-cols-[64px_minmax(0,1fr)_360px]"
    : "grid-cols-[260px_minmax(0,1fr)_360px]"

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <WorkbenchOpenProvider activeBookId={props.activeBookId} onOpenWorkbench={props.onOpenWorkbench}>
        <div className={`relative z-10 grid h-full min-h-0 ${gridCols} transition-[grid-template-columns] duration-300`}>
          <LeftSidebarColumn
            books={props.books}
            chapters={props.chapters}
            outlines={props.outlines}
            activeBookId={props.activeBookId}
            activeChapterId={props.activeChapterId}
            mode={props.mode}
            collapsed={props.collapsed}
            onToggleCollapsed={props.onToggleCollapsed}
            onSelectBook={props.onSelectBook}
            onPrefetchBook={props.onPrefetchBook}
            onSelectChapter={props.onSelectChapter}
            onBackToChat={props.onBackToChat}
            onNewBook={props.onNewBook}
            onNewChapter={props.onNewChapter}
            onDeleteChapter={props.onDeleteChapter}
            onRenameBook={props.onRenameBook}
          />

        <MainContentColumn
          activeBookId={props.activeBookId}
          activeBookTitle={props.activeBookTitle}
          activeChapterId={props.activeChapterId}
          activeThreadId={props.activeThreadId}
          selectedTurnId={props.selectedTurnId}
          turnBranchNavigation={props.turnBranchNavigation}
          reviewing={props.reviewing}
          messages={props.messages}
          turns={props.turns}
          threads={props.threads}
          cards={props.cards}
          importedMaterials={props.importedMaterials}
          mode={props.mode}
          chatCitations={props.chatCitations}
          responseConstraints={props.responseConstraints}
          activeResponseConstraintIds={props.activeResponseConstraintIds}
          rollingBackLedgerEntryId={props.rollingBackLedgerEntryId}
          applyingProposalId={props.applyingProposalId}
          onSelectTurn={props.onSelectTurn}
          onSend={props.onSend}
          onReview={props.onReview}
          onAddCitation={props.onAddCitation}
          onRemoveCitation={props.onRemoveCitation}
          onClearCitations={props.onClearCitations}
          onCreateResponseConstraint={props.onCreateResponseConstraint}
          onUpdateResponseConstraint={props.onUpdateResponseConstraint}
          onDeleteResponseConstraint={props.onDeleteResponseConstraint}
          onSetActiveResponseConstraintIds={props.onSetActiveResponseConstraintIds}
          onCreateThread={props.onCreateThread}
          onSelectThread={props.onSelectThread}
          onRenameThread={props.onRenameThread}
          onSetThreadStatus={props.onSetThreadStatus}
          onForkThread={props.onForkThread}
          onSelectTurnBranch={props.onSelectTurnBranch}
          onSubmitEditedTurn={props.onSubmitEditedTurn}
          onRollbackLedgerEntry={props.onRollbackLedgerEntry}
          onApplyProposal={props.onApplyProposal}
          onDiscardProposal={props.onDiscardProposal}
          onProposalApplied={props.onProposalApplied}
        />

        <RightSidebarColumn
          activeBookId={props.activeBookId}
          chapters={props.chapters}
          cards={props.cards}
          importedMaterials={props.importedMaterials}
          ledgerEntries={props.ledgerEntries}
          rollingBackLedgerEntryId={props.rollingBackLedgerEntryId}
          onAddCitation={props.onAddCitation}
          onImportMaterials={props.onImportMaterials}
          onOpenWorkbench={props.onOpenWorkbench}
          onRollbackLedgerEntry={props.onRollbackLedgerEntry}
        />
        </div>

        <WorkbenchOverlay
          workbenchBook={props.workbenchBook}
          workbenchInitialPath={props.workbenchInitialPath}
          workbenchInitialLine={props.workbenchInitialLine}
          workbenchInitialTab={props.workbenchInitialTab}
          workbenchInitialLedgerEntryId={props.workbenchInitialLedgerEntryId}
          onCloseWorkbench={props.onCloseWorkbench}
        />
      </WorkbenchOpenProvider>
    </main>
  )
}
