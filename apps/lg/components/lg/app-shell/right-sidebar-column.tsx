"use client"

import { RightSidebar } from "@/components/lg/right-sidebar"
import { importedMaterialToReference, settingCardToReference } from "@/lib/chat-references"
import type { AppShellProps } from "./types"

type RightSidebarColumnProps = Pick<
  AppShellProps,
  | "activeBookId"
  | "chapters"
  | "cards"
  | "importedMaterials"
  | "ledgerEntries"
  | "rollingBackLedgerEntryId"
  | "onAddCitation"
  | "onImportMaterials"
  | "onOpenWorkbench"
  | "onRollbackLedgerEntry"
>

export function RightSidebarColumn({
  activeBookId,
  chapters,
  cards,
  importedMaterials,
  ledgerEntries,
  rollingBackLedgerEntryId,
  onAddCitation,
  onImportMaterials,
  onOpenWorkbench,
  onRollbackLedgerEntry,
}: RightSidebarColumnProps) {
  return (
    <div className="min-h-0 border-l border-border/60">
      <RightSidebar
        activeBookId={activeBookId}
        chapters={chapters}
        cards={cards}
        importedMaterials={importedMaterials}
        ledgerEntries={ledgerEntries}
        rollingBackEntryId={rollingBackLedgerEntryId}
        onCite={(card) => onAddCitation(settingCardToReference(card))}
        onCiteMaterial={(material) => onAddCitation(importedMaterialToReference(material))}
        onImportMaterials={onImportMaterials}
        onOpenFile={(path) => {
          if (!activeBookId) return
          onOpenWorkbench(activeBookId, { path, initialTab: "editor" })
        }}
        onRollbackEntry={onRollbackLedgerEntry}
      />
    </div>
  )
}
