import type { ChatCitation, ChatSendOptions } from "@/components/lg/chat-panel"
import type { Book, Chapter, Message, OutlineFile, SettingCard, Thread, Turn } from "@/lib/mock-data"
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
  ledgerEntries: LedgerEntry[]
  rollingBackLedgerEntryId: string | null
  applyingProposalId: string | null
  activeBookId: string
  activeBookTitle: string
  activeChapterId: string | null
  activeThreadId: string
  selectedTurnId: string | null
  reviewing: boolean
  mode: AppMode
  collapsed: boolean
  chatCitations: ChatCitation[]
  responseConstraints: ResponseConstraint[]
  activeResponseConstraintIds: string[]
  workbenchBook: Book | null
  workbenchInitialPath?: string
  onToggleCollapsed: () => void
  onSelectBook: (bookId: string) => void
  onSelectChapter: (chapterId: string) => void
  onBackToChat: () => void
  onNewBook: () => void
  onNewChapter: () => void
  onOpenWorkbench: (bookId: string, path?: string) => void
  onRollbackLedgerEntry: (entryId: string) => Promise<void>
  onApplyProposal: (proposalId: string, hunkIds?: string[]) => Promise<string | undefined>
  onDiscardProposal: (proposalId: string) => Promise<void>
  onProposalApplied: () => Promise<void>
  onRenameBook: (bookId: string, newTitle: string) => void
  onSelectTurn: (turnId: string) => void
  onSend: (text: string, citations: ChatCitation[], options: ChatSendOptions) => Promise<void>
  onReview: () => Promise<void>
  onAddCitation: (card: SettingCard) => void
  onRemoveCitation: (cardId: string) => void
  onClearCitations: () => void
  onCreateResponseConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateResponseConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteResponseConstraint: (constraintId: string) => Promise<void>
  onSetActiveResponseConstraintIds: (constraintIds: string[]) => Promise<void>
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSetThreadStatus: (threadId: string, status: Thread["status"]) => void
  onForkThread: (turnId: string) => void
  onCloseWorkbench: () => void
}
