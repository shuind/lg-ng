export interface Book {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  rootPath: string
  cover?: string
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

export interface WorkbenchFile {
  id: string
  name: string
  path: string
  modified?: boolean
}

export interface WorkbenchGroup {
  id: string
  label: string
  files: WorkbenchFile[]
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
  activeSkillIds?: string[]
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

export interface ImportedMaterial {
  id: string
  name: string
  path: string
  summary: string
  size: number
  updatedAt: string
}

export type ChatReferenceKind = "setting" | "material"

export interface ChatReference {
  id: string
  kind: ChatReferenceKind
  type: string
  name: string
  summary: string
  path?: string
  content?: string
  category?: SettingCard["category"]
  aliases?: string[]
  meta?: Record<string, string>
  size?: number
  updatedAt?: string
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
  source?: "style_guide" | "workspace_skill" | "manual"
  stage?: SkillLabStage
  originObservationId?: string
  originExperimentId?: string
  usage?: SkillUsageStats
  trials?: SkillTrial[]
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
  triggers?: string
  examples?: string
  resourceKinds?: SkillResourceKind[]
}

export interface SkillDraftResponse {
  name: string
  skillMd: string
  resources: SkillTextResource[]
  warnings: string[]
}

export type SkillSuggestionKind = "new" | "improve"

export type SkillLabStage = "experimental" | "active"

export type SkillSuggestionStatus =
  | "surfacing"
  | "confirmed"
  | "incubated"
  | "dismissed"
  | "open"
  | "drafted"
  | "applied"

export type SkillObservationOrigin = "effective_prompt" | "manual_rewrite" | "ai_diff" | "user_explore" | "manual"

export interface SkillSuggestionEvidence {
  ledgerEntryId: string
  targetPath: string
  note: string
}

export interface SkillUsageStats {
  timesUsed: number
  timesRewritten: number
  rewriteRate: number
  recentRewrites: SkillSuggestionEvidence[]
}

export type SkillTrialSampleSource = "ledger" | "editor" | "paste"

export type SkillTrialVerdict = "helped" | "no_diff" | "hurt"

export type SkillExperimentEntry = "scratch" | "from_lead" | "improve_skill"

export type SkillExperimentMode = "with_without" | "a_b"

export interface SkillExperimentRunRequest {
  entry?: SkillExperimentEntry
  mode?: SkillExperimentMode
  instruction: string
  baselineInstruction?: string
  sampleText: string
  sampleSource?: SkillTrialSampleSource
  targetSkillName?: string
}

export interface SkillExperimentResult {
  id: string
  entry: SkillExperimentEntry
  mode: SkillExperimentMode
  instruction: string
  baselineInstruction?: string
  sampleText: string
  sampleSource: SkillTrialSampleSource
  targetSkillName?: string
  outputA: string
  outputB: string
  createdAt: string
}

export interface SkillExperimentSaveRequest {
  nameHint: string
  title?: string
  instruction: string
  sampleText?: string
  sourceSuggestionId?: string
  originExperimentId?: string
}

export interface SkillTrial {
  id: string
  skillName: string
  sampleSource: SkillTrialSampleSource
  sampleText: string
  outputWithout: string
  outputWith: string
  verdict: SkillTrialVerdict | null
  judgeNote?: string
  createdAt: string
}

export interface SkillLabMeta {
  name: string
  stage: SkillLabStage
  originObservationId?: string
  originExperimentId?: string
  trials: SkillTrial[]
}

export interface SkillSuggestion {
  id: string
  kind: SkillSuggestionKind
  status: SkillSuggestionStatus
  title: string
  observation: string
  confidence: number
  strength: number
  seenInAnalyses: number
  origin: SkillObservationOrigin
  evidence: SkillSuggestionEvidence[]
  incubatedSkillName?: string
  /** kind === "new": a brand-new skill the user could create */
  proposedName?: string
  proposedRules?: string[]
  /** kind === "improve": refine an existing workspace skill */
  targetSkillName?: string
  targetSkillTitle?: string
  proposedChange?: string
  createdAt: string
  updatedAt: string
}

export interface SkillLabResponse {
  suggestions: SkillSuggestion[]
  analyzedAt: string
  analyzedRevisionCount: number
  modelConfigured: boolean
}

export interface SkillLabAnalyzeRequest {
  ledgerEntryIds: string[]
  focus?: string
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

export type WorkflowAction = "continue" | "revise" | "plant" | "resolve" | "diagnose" | "plan"

export interface ChatChangeEntry {
  id: string
  targetPath: string
  summary: string
  diffPatch?: string
  diffOmitted?: boolean
  rollbackable: boolean
}

export interface MessageChangeSet {
  entries: ChatChangeEntry[]
}

export type ProposalStatus = "pending" | "applied" | "partially_applied" | "discarded"
export type ProposalSource = "chat" | "draft" | "workflow"

export interface ProposalHunk {
  id: string
  baseStartLine: number
  baseLineCount: number
  replacementText: string
  preview: string
}

export interface ChangeProposal {
  id: string
  bookId: string
  targetPath: string
  source: ProposalSource
  status: ProposalStatus
  summary: string
  baseHash: string
  baseContent: string
  afterContent: string
  diffPatch: string
  hunks: ProposalHunk[]
  appliedHunkIds?: string[]
  ledgerEntryId?: string
  createdAt: string
  updatedAt: string
}

export interface ProposalSummary {
  id: string
  targetPath: string
  source: ProposalSource
  status: ProposalStatus
  summary: string
  diffPatch: string
  hunks: ProposalHunk[]
}

export interface MessageProposalSet {
  proposals: ProposalSummary[]
}

export type AgentEventType = "observe" | "retrieve" | "plan" | "reasoning" | "tool_call" | "done" | "error"

export interface AgentEvent {
  id: string
  turnId: string
  type: AgentEventType
  text?: string
  paths?: string[]
  steps?: string[]
  name?: string
  argsPreview?: string
  resultPreview?: string
  usage?: {
    paymentSource?: "balance" | "api"
    promptTokens: number
    promptCacheHitTokens?: number
    promptCacheMissTokens?: number
    completionTokens: number
    totalTokens: number
    estimatedCostCny?: number
    chargedAmountCny?: number
    commissionAmountCny?: number
    balanceAfterCny?: number | null
  }
  durationMs?: number
  ledgerEntryIds?: string[]
  subagent?: string
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
  agentSessionId?: string
  status: "running" | "done" | "failed" | "cancelled"
  error?: string
  createdAt: string
  updatedAt: string
}

export interface MessageContextWindow {
  estimatedTokens: number
  budgetTokens: number
  ratio: number
  triggerRatio: number
  lastCompactedAt?: string
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
  contextWindow?: MessageContextWindow
  changeSet?: MessageChangeSet
  proposalSet?: MessageProposalSet
}

export interface SettingCard {
  id: string
  category: "character" | "location" | "faction" | "mechanism" | "formation" | "event" | "rule" | "other"
  name: string
  aliases?: string[]
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
