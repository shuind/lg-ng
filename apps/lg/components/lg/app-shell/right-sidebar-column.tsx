"use client"

import { RightSidebar } from "@/components/lg/right-sidebar"
import type { AppShellProps } from "./types"

type RightSidebarColumnProps = Pick<
  AppShellProps,
  | "activeBookId"
  | "cards"
  | "ledgerEntries"
  | "rollingBackLedgerEntryId"
  | "onAddCitation"
  | "onOpenWorkbench"
  | "onRollbackLedgerEntry"
>

export function RightSidebarColumn({
  activeBookId,
  cards,
  ledgerEntries,
  rollingBackLedgerEntryId,
  onAddCitation,
  onOpenWorkbench,
  onRollbackLedgerEntry,
}: RightSidebarColumnProps) {
  return (
    <div className="min-h-0 border-l border-border/60">
      <RightSidebar
        cards={cards}
        ledgerEntries={ledgerEntries}
        rollingBackEntryId={rollingBackLedgerEntryId}
        onCite={onAddCitation}
        onOpenFile={(path) => activeBookId && onOpenWorkbench(activeBookId, path)}
        onRollbackEntry={onRollbackLedgerEntry}
      />
    </div>
  )
}
