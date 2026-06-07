import type { Book } from "@/lib/mock-data"

export interface WorkbenchProps {
  book: Book
  onClose: () => void
  initialPath?: string
}

export type Tab = "editor" | "ledger" | "skill"

