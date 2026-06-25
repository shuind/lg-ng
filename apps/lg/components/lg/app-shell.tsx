"use client"

import { useState } from "react"
import { LeftSidebarColumn } from "./app-shell/left-sidebar-column"
import { MainContentColumn } from "./app-shell/main-content-column"
import { RightSidebarColumn } from "./app-shell/right-sidebar-column"
import { MobileDrawer } from "./app-shell/mobile-drawer"
import { MobileTopBar } from "./app-shell/mobile-top-bar"
import type { AppMode, AppShellProps } from "./app-shell/types"
import { WorkbenchOverlay } from "./app-shell/workbench-overlay"
import { WorkbenchOpenProvider } from "./workbench-open-context"

export type { AppMode }

export function AppShell(props: AppShellProps) {
  const [mobileDrawer, setMobileDrawer] = useState<"left" | "right" | null>(null)

  const gridCols = props.collapsed
    ? "md:grid-cols-[64px_minmax(0,1fr)_360px]"
    : "md:grid-cols-[260px_minmax(0,1fr)_360px]"

  const renderLeftSidebar = (onNavigate?: () => void) => (
    <LeftSidebarColumn
      books={props.books}
      chapters={props.chapters}
      outlines={props.outlines}
      activeBookId={props.activeBookId}
      activeChapterId={props.activeChapterId}
      mode={props.mode}
      collapsed={props.collapsed}
      onToggleCollapsed={props.onToggleCollapsed}
      onSelectBook={(id) => {
        props.onSelectBook(id)
        onNavigate?.()
      }}
      onPrefetchBook={props.onPrefetchBook}
      onSelectChapter={(id) => {
        props.onSelectChapter(id)
        onNavigate?.()
      }}
      onBackToChat={() => {
        props.onBackToChat()
        onNavigate?.()
      }}
      onNewBook={props.onNewBook}
      onDeleteBook={props.onDeleteBook}
      onNewChapter={props.onNewChapter}
      onDeleteChapter={props.onDeleteChapter}
      onRenameBook={props.onRenameBook}
    />
  )

  const rightSidebar = (
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
  )

  const mainContent = (
    <MainContentColumn
      activeBookId={props.activeBookId}
      activeBookTitle={props.activeBookTitle}
      activeChapterId={props.activeChapterId}
      activeThreadId={props.activeThreadId}
      selectedTurnId={props.selectedTurnId}
      turnBranchNavigation={props.turnBranchNavigation}
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
    />
  )

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <WorkbenchOpenProvider activeBookId={props.activeBookId} onOpenWorkbench={props.onOpenWorkbench}>
        {/* 桌面端:固定三栏 */}
        <div
          className={`relative z-10 hidden h-full min-h-0 md:grid ${gridCols} transition-[grid-template-columns] duration-300`}
        >
          {renderLeftSidebar()}
          {mainContent}
          {rightSidebar}
        </div>

        {/* 移动端:单栏 + 顶部工具条 + 抽屉 */}
        <div className="relative z-10 flex h-full min-h-0 flex-col md:hidden">
          <MobileTopBar
            title={props.activeBookTitle || "LG 工作台"}
            onOpenLeft={() => setMobileDrawer("left")}
            onOpenRight={() => setMobileDrawer("right")}
          />
          <div className="min-h-0 flex-1">{mainContent}</div>
        </div>

        <div className="md:hidden">
          <MobileDrawer
            open={mobileDrawer === "left"}
            side="left"
            title="书籍与章节"
            onClose={() => setMobileDrawer(null)}
          >
            {renderLeftSidebar(() => setMobileDrawer(null))}
          </MobileDrawer>
          <MobileDrawer
            open={mobileDrawer === "right"}
            side="right"
            title="项目状态"
            onClose={() => setMobileDrawer(null)}
          >
            {rightSidebar}
          </MobileDrawer>
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
