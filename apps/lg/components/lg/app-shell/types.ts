import type { ChatCitation, ChatSendOptions } from "@/components/lg/chat-panel/types"
import type { WorkbenchOpenOptions } from "@/components/lg/workbench/types"
import type { TurnBranchNavigation } from "@/components/lg/chat-panel/types"
import type { Book, Chapter, ChatReference, ImportedMaterial, Message, OutlineFile, SettingCard, Thread, Turn } from "@/lib/types"
import type { ImportMaterialsResponse } from "@/lib/api/imports"
import type { LedgerEntry, ResponseConstraint } from "@/lib/types"

export type AppMode = "chat" | "writing"

export interface AppShellProps {
  books: Book[]
  chapters: Chapter[]
  outlines: OutlineFile[]
  messages: Message[]
  turns: Turn[]
  threads: Thread[]
  cards: SettingCard[]
  importedMaterials: ImportedMaterial[]
  ledgerEntries: LedgerEntry[]
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  activeBookId: string
  activeBookTitle: string
  activeChapterId: string | null
  activeThreadId: string
  selectedTurnId: string | null
  turnBranchNavigation: Record<string, TurnBranchNavigation>
  mode: AppMode
  collapsed: boolean
  chatCitations: ChatCitation[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  workbenchBook: Book | null
  workbenchInitialPath?: string
  workbenchInitialLine?: number
  workbenchInitialTab?: WorkbenchOpenOptions["initialTab"]
  workbenchInitialLedgerEntryId?: string
  onToggleCollapsed: () => void
  onSelectBook: (bookId: string) => void
  onPrefetchBook: (bookId: string) => void
  onSelectChapter: (chapterId: string) => void
  onBackToChat: () => void
  onNewBook: () => void
  onDeleteBook: (bookId: string) => Promise<void>
  onNewChapter: () => void
  onDeleteChapter: (chapterId: string) => Promise<void>
  onOpenWorkbench: (bookId: string, options?: string | WorkbenchOpenOptions) => void
  onRollbackLedgerEntry: (entryId: string) => Promise<void>
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
  onRenameBook: (bookId: string, newTitle: string) => void
  onSelectTurn: (turnId: string) => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onAddCitation: (reference: ChatReference) => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
  onImportMaterials: (files: File[]) => Promise<ImportMaterialsResponse>
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onSetActiveResponseConstraintIds: (constraintIds: string[]) => Promise<void>
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
  onForkThread: (turnId: string) => void
  onSelectTurnBranch: (turnId: string) => void
  onSubmitEditedTurn: (turnId: string, content: string) => Promise<void>
  onCloseWorkbench: () => void
}
