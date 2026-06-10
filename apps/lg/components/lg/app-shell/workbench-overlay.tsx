"use client"

import dynamic from "next/dynamic"
import type { AppShellProps } from "./types"

const Workbench = dynamic(
  () => import("@/components/lg/workbench/index").then((mod) => mod.Workbench),
  { ssr: false },
)

type WorkbenchOverlayProps = Pick<
  AppShellProps,
  "workbenchBook" | "workbenchInitialPath" | "workbenchInitialLine" | "workbenchInitialTab" | "workbenchInitialLedgerEntryId" | "onCloseWorkbench"
>

export function WorkbenchOverlay({
  workbenchBook,
  workbenchInitialPath,
  workbenchInitialLine,
  workbenchInitialTab,
  workbenchInitialLedgerEntryId,
  onCloseWorkbench,
}: WorkbenchOverlayProps) {
  if (!workbenchBook) return null

  return (
    <Workbench
      book={workbenchBook}
      initialPath={workbenchInitialPath}
      initialLine={workbenchInitialLine}
      initialTab={workbenchInitialTab}
      initialLedgerEntryId={workbenchInitialLedgerEntryId}
      onClose={onCloseWorkbench}
    />
  )
}
