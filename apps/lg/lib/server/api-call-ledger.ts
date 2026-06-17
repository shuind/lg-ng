import crypto from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import type { PaymentSource } from "@/lib/billing"
import { getGlobalDataRoot } from "@/lib/server/paths"
import { getCurrentUserId } from "@/lib/server/request-context"
import type { EngineModelUsageEvent, ModelRawUsage, ModelUsage } from "novel-guide"

const API_CALL_LEDGER_FILE = "api-call-ledger.jsonl"

export interface ApiCallLedgerEntry {
  id: string
  userId: string | null
  bookId?: string
  threadId?: string
  agentSessionId?: string
  provider: string
  model: string
  feature: string
  operation?: EngineModelUsageEvent["operation"] | "chat_completion" | "review"
  paymentSource: PaymentSource
  stream: boolean
  status: "ok"
  durationMs?: number
  loop?: number
  rawUsage: ModelRawUsage
  normalizedUsage: Omit<ModelUsage, "rawUsage">
  totalUsage?: Omit<ModelUsage, "rawUsage">
  billingEntryId?: string
  createdAt: string
}

export interface ApiCallUsageInput {
  userId?: string | null
  bookId?: string
  threadId?: string
  agentSessionId?: string
  provider: string
  model: string
  feature: string
  operation?: ApiCallLedgerEntry["operation"]
  paymentSource: PaymentSource
  stream: boolean
  durationMs?: number
  loop?: number
  usage: ModelUsage
  totalUsage?: ModelUsage
  billingEntryId?: string
}

function apiCallLedgerPath(): string {
  return path.join(getGlobalDataRoot(), "admin", API_CALL_LEDGER_FILE)
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function normalizeUsageForLedger(usage: ModelUsage): Omit<ModelUsage, "rawUsage"> {
  const promptTokens = normalizeNumber(usage.promptTokens)
  const promptCacheHitTokens = normalizeNumber(usage.promptCacheHitTokens)
  return {
    promptTokens,
    promptCacheHitTokens,
    promptCacheMissTokens: normalizeNumber(
      usage.promptCacheMissTokens ?? Math.max(0, promptTokens - promptCacheHitTokens),
    ),
    completionTokens: normalizeNumber(usage.completionTokens),
    totalTokens: normalizeNumber(usage.totalTokens || promptTokens + normalizeNumber(usage.completionTokens)),
  }
}

function rawUsageForLedger(usage: ModelUsage): ModelRawUsage {
  if (usage.rawUsage) return usage.rawUsage
  const normalized = normalizeUsageForLedger(usage)
  return {
    prompt_tokens: normalized.promptTokens,
    completion_tokens: normalized.completionTokens,
    total_tokens: normalized.totalTokens,
    prompt_cache_hit_tokens: normalized.promptCacheHitTokens,
    prompt_cache_miss_tokens: normalized.promptCacheMissTokens,
  }
}

export async function recordApiCallUsage(input: ApiCallUsageInput): Promise<ApiCallLedgerEntry> {
  const entry: ApiCallLedgerEntry = {
    id: crypto.randomUUID(),
    userId: input.userId ?? getCurrentUserId() ?? null,
    bookId: input.bookId,
    threadId: input.threadId,
    agentSessionId: input.agentSessionId,
    provider: input.provider,
    model: input.model,
    feature: input.feature,
    operation: input.operation,
    paymentSource: input.paymentSource,
    stream: input.stream,
    status: "ok",
    durationMs: input.durationMs,
    loop: input.loop,
    rawUsage: rawUsageForLedger(input.usage),
    normalizedUsage: normalizeUsageForLedger(input.usage),
    totalUsage: input.totalUsage ? normalizeUsageForLedger(input.totalUsage) : undefined,
    billingEntryId: input.billingEntryId,
    createdAt: new Date().toISOString(),
  }
  await fsp.mkdir(path.dirname(apiCallLedgerPath()), { recursive: true })
  await fsp.appendFile(apiCallLedgerPath(), `${JSON.stringify(entry)}\n`, "utf8")
  return entry
}
