import fs from "fs/promises"
import path from "path"
import { getDataRoot } from "@/lib/server/paths"

const AGENT_DIR = "agent"
const AGENT_RULES_FILE = "agent-rules.jsonl"
const FAILURE_CASES_FILE = "failure-cases.jsonl"
const EVAL_CASES_FILE = "eval-cases.jsonl"
const USER_PREFERENCES_FILE = "user-preferences.jsonl"
const CONVERSATION_SUMMARIES_FILE = "conversation-summaries.jsonl"

type MemorySource = "self_improvement" | "action"

export interface AgentMemorySource {
  bookId?: string
  threadId?: string
  turnId?: string
  userMessage?: string
  assistantReply?: string
  source: MemorySource
}

export interface AgentRuleRecord extends AgentMemorySource {
  id: string
  rule: string
  reason?: string
  createdAt: string
}

export interface FailureCaseRecord extends AgentMemorySource {
  id: string
  triggerReason?: string
  failureChain: string[]
  failureLayers: string[]
  codexBrief?: string
  status: "open" | "fixed"
  createdAt: string
}

export interface EvalCaseRecord extends AgentMemorySource {
  id: string
  caseText: string
  sourceFailureCaseId?: string
  createdAt: string
}

export interface UserPreferenceRecord extends AgentMemorySource {
  id: string
  preference: string
  createdAt: string
}

export interface ConversationSummaryRecord extends AgentMemorySource {
  id: string
  summary: string
  createdAt: string
}

export interface SelfImprovementRecord {
  triggered: boolean
  triggerReason?: string
  failureChain?: string[]
  failureLayers?: string[]
  codexBrief?: string
  proposedEvalCases?: string[]
  proposedRules?: string[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function agentFilePath(fileName: string): string {
  return path.join(getDataRoot(), AGENT_DIR, fileName)
}

async function appendJsonl<T>(fileName: string, records: T[]): Promise<void> {
  if (records.length === 0) return
  const target = agentFilePath(fileName)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.appendFile(target, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8")
}

export async function appendAgentRule(args: {
  rule: string
  reason?: string
  source: AgentMemorySource
}): Promise<AgentRuleRecord> {
  const record: AgentRuleRecord = {
    ...args.source,
    id: makeId("agent-rule"),
    rule: args.rule,
    reason: args.reason,
    createdAt: nowIso(),
  }
  await appendJsonl(AGENT_RULES_FILE, [record])
  return record
}

export async function recordSelfImprovement(args: {
  bookId: string
  threadId: string
  turnId: string
  userMessage: string
  assistantReply: string
  selfImprovement?: SelfImprovementRecord
}): Promise<{
  failureCase?: FailureCaseRecord
  evalCases: EvalCaseRecord[]
  rules: AgentRuleRecord[]
}> {
  const selfImprovement = args.selfImprovement
  if (!selfImprovement) {
    return { evalCases: [], rules: [] }
  }

  const source: AgentMemorySource = {
    bookId: args.bookId,
    threadId: args.threadId,
    turnId: args.turnId,
    userMessage: args.userMessage,
    assistantReply: args.assistantReply,
    source: "self_improvement",
  }

  let failureCase: FailureCaseRecord | undefined
  if (selfImprovement.triggered) {
    failureCase = {
      ...source,
      id: makeId("failure"),
      triggerReason: selfImprovement.triggerReason,
      failureChain: selfImprovement.failureChain ?? [],
      failureLayers: selfImprovement.failureLayers ?? [],
      codexBrief: selfImprovement.codexBrief,
      status: "open",
      createdAt: nowIso(),
    }
    await appendJsonl(FAILURE_CASES_FILE, [failureCase])
  }

  const evalCases: EvalCaseRecord[] = selfImprovement.triggered
    ? (selfImprovement.proposedEvalCases ?? []).map((caseText) => ({
        ...source,
        id: makeId("eval"),
        caseText,
        sourceFailureCaseId: failureCase?.id,
        createdAt: nowIso(),
      }))
    : []
  await appendJsonl(EVAL_CASES_FILE, evalCases)

  const rules: AgentRuleRecord[] = []
  for (const rule of selfImprovement.proposedRules ?? []) {
    rules.push(await appendAgentRule({
      rule,
      reason: selfImprovement.triggerReason,
      source,
    }))
  }

  return { failureCase, evalCases, rules }
}

export async function appendUserPreference(args: {
  preference: string
  source: AgentMemorySource
}): Promise<UserPreferenceRecord> {
  const record: UserPreferenceRecord = {
    ...args.source,
    id: makeId("pref"),
    preference: args.preference,
    createdAt: nowIso(),
  }
  await appendJsonl(USER_PREFERENCES_FILE, [record])
  return record
}

export async function appendConversationSummary(args: {
  summary: string
  source: AgentMemorySource
}): Promise<ConversationSummaryRecord> {
  const record: ConversationSummaryRecord = {
    ...args.source,
    id: makeId("conv-summary"),
    summary: args.summary,
    createdAt: nowIso(),
  }
  await appendJsonl(CONVERSATION_SUMMARIES_FILE, [record])
  return record
}
