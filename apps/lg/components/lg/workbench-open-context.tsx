"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

interface WorkbenchOpenContextValue {
  activeBookId: string
  openPath: (path?: string) => void
}

const WorkbenchOpenContext = createContext<WorkbenchOpenContextValue | null>(null)

export function WorkbenchOpenProvider({
  activeBookId,
  onOpenWorkbench,
  children,
}: {
  activeBookId: string
  onOpenWorkbench: (bookId: string, path?: string) => void
  children: ReactNode
}) {
  const value = useMemo<WorkbenchOpenContextValue>(() => ({
    activeBookId,
    openPath(path) {
      if (!activeBookId) return
      onOpenWorkbench(activeBookId, path)
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
