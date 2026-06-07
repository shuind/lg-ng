"use client"

import { Workbench } from "@/components/lg/workbench"
import type { AppShellProps } from "./types"

type WorkbenchOverlayProps = Pick<AppShellProps, "workbenchBook" | "workbenchInitialPath" | "onCloseWorkbench">

export function WorkbenchOverlay({
  workbenchBook,
  workbenchInitialPath,
  onCloseWorkbench,
}: WorkbenchOverlayProps) {
  if (!workbenchBook) return null

  return (
    <Workbench
      book={workbenchBook}
      initialPath={workbenchInitialPath}
      onClose={onCloseWorkbench}
    />
  )
}
