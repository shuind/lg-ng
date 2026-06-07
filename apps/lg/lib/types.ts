export interface Book {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  rootPath: string
}

export interface BookTreeNode {
  id: string
  name: string
  path: string
  type: "file" | "directory"
  children?: BookTreeNode[]
  updatedAt?: string
}

export interface BookFile {
  bookId: string
  path: string
  content: string
  updatedAt: string
}

export interface LedgerEntry {
  id: string
  bookId: string
  timestamp: string
  actor: "user" | "agent"
  action: string
  targetPath: string
  summary: string
  beforeHash?: string
  afterHash?: string
  diffPatch?: string
  fileRevision?: number
  baseCheckpointHash?: string
  baseCheckpointPath?: string
  checkpointHash?: string
  checkpointPath?: string
  checkpointReason?: "interval"
  beforeSnapshot?: string
  afterSnapshot?: string
}

export interface LedgerListOptions {
  limit?: number
  cursor?: string
}

export interface LedgerListResponse {
  entries: LedgerEntry[]
  nextCursor?: string
}

export interface RelationshipGraphNode {
  id: string
  label: string
}

export interface RelationshipGraphEdge {
  source: string
  target: string
  label: string
}

export interface RelationshipGraph {
  nodes: RelationshipGraphNode[]
  edges: RelationshipGraphEdge[]
}

export interface RetrievedContext {
  id: string
  bookId: string
  path: string
  reason: "dirty" | "keyword" | "recent"
  score: number
  updatedAt: string
  excerpt: string
}

export interface Skill {
  id: string
  type: string
  name?: string
  description?: string
  scope: "global" | "book"
  bookId?: string
  sourceFile: string
  summaryFile?: string
  summaryTokenCount: number
  lastSourceModified: string
  lastSummaryGenerated: string
  dirty: boolean
  source?: "style_guide" | "claude_skill" | "manual"
}

export interface SkillSummary {
  skill: Skill
  summary: string
  refreshable: boolean
}

export type SkillResourceKind = "references" | "scripts" | "assets"

export interface SkillTextResource {
  path: string
  content: string
}

export interface SkillDraftRequest {
  nameHint: string
  goal: string
  triggers: string
  examples: string
  resourceKinds: SkillResourceKind[]
}

export interface SkillDraftResponse {
  name: string
  skillMd: string
  resources: SkillTextResource[]
  warnings: string[]
}

export interface CreateSkillRequest {
  name: string
  skillMd: string
  resources?: SkillTextResource[]
}

export interface UpdateSkillRequest extends CreateSkillRequest {
  originalName: string
}

export interface Chapter {
  id: string
  bookId: string
  title: string
  index: number
  wordCount: number
  status: "draft" | "writing" | "done"
  path: string
  updatedAt: string
}

export interface OutlineFile {
  id: string
  bookId: string
  title: string
  level: "volume" | "chapter"
  path: string
  updatedAt: string
}

export interface ChapterContent {
  id: string
  bookId: string
  title: string
  content: string
  path: string
  updatedAt: string
}

export interface IntentBrief {
  understood: string[]
  contextPaths?: string[]
  changedPaths?: string[]
  missing?: string[]
  diagnosis?: string[]
  recommendations?: string[]
  investigation?: {
    goal: string
    sources: string[]
    findings: string[]
    unresolved: string[]
  }
  factCheck?: {
    checked: string[]
    corrected: string[]
    unresolved: string[]
  }
  usedFragments?: string[]
  toolTrace?: string[]
}

export type AgentEventType = "observe" | "retrieve" | "plan" | "tool_call" | "done" | "error"

export interface AgentEvent {
  id: string
  turnId: string
  type: AgentEventType
  text?: string
  paths?: string[]
  steps?: string[]
  name?: string
  argsPreview?: string
  message?: string
  createdAt: string
}

export interface Thread {
  id: string
  bookId: string
  title: string
  status: "active" | "archived" | "deleted"
  rootTurnId?: string
  branchFrom?: {
    threadId: string
    turnId: string
  }
  archivedAt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Turn {
  id: string
  threadId: string
  parentTurnId?: string
  userMessageId: string
  assistantMessageId?: string
  status: "running" | "done" | "failed" | "cancelled"
  error?: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  threadId: string
  turnId: string
  role: "user" | "assistant" | "system"
  content: string
  version: number
  deletedAt?: string
  createdAt: string
  thought?: string
  thoughtSeconds?: number
  references?: { type: string; name: string; path: string }[]
  constraints?: AppliedResponseConstraint[]
  brief?: IntentBrief
  events?: AgentEvent[]
}

export interface SettingCard {
  id: string
  category: "character" | "location" | "faction" | "mechanism" | "formation" | "event" | "rule" | "other"
  name: string
  summary: string
  content?: string
  path?: string
  meta?: Record<string, string>
}

export interface ResponseConstraint {
  id: string
  title: string
  instruction: string
  createdAt: string
  updatedAt: string
}

export interface AppliedResponseConstraint {
  id?: string
  title: string
  instruction: string
  source: "library" | "temporary"
}
