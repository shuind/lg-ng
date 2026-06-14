import type { Book } from "@/lib/types"

export type Tab = "editor" | "ledger" | "skill" | "lab"

export interface WorkbenchOpenOptions {
  path?: string
  initialLine?: number
  initialTab?: Tab
  initialLedgerEntryId?: string
}

export interface WorkbenchProps {
  book: Book
  onClose: () => void
  initialPath?: string
  initialLine?: number
  initialTab?: Tab
  initialLedgerEntryId?: string
}
