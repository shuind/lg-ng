"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { WorkbenchOpenOptions } from "./workbench/types"

interface WorkbenchOpenContextValue {
  activeBookId: string
  open: () => void
  openPath: (path?: string, options?: Pick<WorkbenchOpenOptions, "initialLine">) => void
  openLedger: (entryId: string, path?: string) => void
}

const WorkbenchOpenContext = createContext<WorkbenchOpenContextValue | null>(null)

export function WorkbenchOpenProvider({
  activeBookId,
  onOpenWorkbench,
  children,
}: {
  activeBookId: string
  onOpenWorkbench: (bookId: string, options?: string | WorkbenchOpenOptions) => void
  children: ReactNode
}) {
  const value = useMemo<WorkbenchOpenContextValue>(() => ({
    activeBookId,
    open() {
      if (!activeBookId) return
      onOpenWorkbench(activeBookId)
    },
    openPath(path, options) {
      if (!activeBookId) return
      onOpenWorkbench(activeBookId, {
        path,
        initialLine: options?.initialLine,
        initialTab: "editor",
      })
    },
    openLedger(entryId, path) {
      if (!activeBookId) return
      onOpenWorkbench(activeBookId, {
        path,
        initialTab: "ledger",
        initialLedgerEntryId: entryId,
      })
    },
  }), [activeBookId, onOpenWorkbench])

  return (
    <WorkbenchOpenContext.Provider value={value}>
      {children}
    </WorkbenchOpenContext.Provider>
  )
}

export function useWorkbenchOpen(): WorkbenchOpenContextValue | null {
  return useContext(WorkbenchOpenContext)
}
