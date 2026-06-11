import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { getCurrentUserId } from "@/lib/server/request-context"
import { getGlobalDataRoot } from "@/lib/server/paths"

const QUOTA_SETTINGS_FILE = "quota-settings.json"
const QUOTA_USAGE_FILE = "quota-usage.jsonl"
const DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z"

export type TrialQuotaSettings = {
  enabled: boolean
  totalBudgetCny: number
  perUserBudgetCny: number
  userBudgetsCny: Record<string, number>
  promptCacheHitPricePerMillionCny: number
  promptCacheMissPricePerMillionCny: number
  outputPricePerMillionCny: number
  updatedAt: string
}

export type TrialQuotaUsageRecord = {
  id: string
  userId: string
  provider: string
  model: string
  source: "platform"
  promptTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostCny: number
  createdAt: string
  feature: string
}

export type TrialQuotaUserUsage = {
  userId: string
  budgetCny: number
  remainingCny: number
  promptTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostCny: number
  requestCount: number
}

export type TrialQuotaSummary = {
  settings: TrialQuotaSettings
  platformApiKeyConfigured: boolean
  enforcementEnabled: boolean
  total: {
    promptTokens: number
    promptCacheHitTokens: number
    promptCacheMissTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostCny: number
    requestCount: number
    remainingCny: number
  }
  byUser: TrialQuotaUserUsage[]
}

type TrialQuotaSettingsInput = Partial<Omit<TrialQuotaSettings, "updatedAt">>

type TokenUsage = {
  promptTokens: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
  completionTokens: number
  totalTokens: number
}

let quotaLock: Promise<void> = Promise.resolve()

function quotaDir(): string {
  return path.join(getGlobalDataRoot(), "admin")
}

function quotaSettingsPath(): string {
  return path.join(quotaDir(), QUOTA_SETTINGS_FILE)
}

function quotaUsagePath(): string {
  return path.join(quotaDir(), QUOTA_USAGE_FILE)
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function defaultSettings(): TrialQuotaSettings {
  return {
    enabled: process.env.LG_TRIAL_QUOTA_ENABLED === "true",
    totalBudgetCny: numberFromEnv("LG_TRIAL_QUOTA_TOTAL_CNY", 20),
    perUserBudgetCny: numberFromEnv("LG_TRIAL_QUOTA_PER_USER_CNY", 2),
    userBudgetsCny: {},
    promptCacheHitPricePerMillionCny: numberFromEnv("LG_TRIAL_QUOTA_CACHE_HIT_PRICE_PER_MILLION_CNY", 0),
    promptCacheMissPricePerMillionCny: numberFromEnv(
      "LG_TRIAL_QUOTA_CACHE_MISS_PRICE_PER_MILLION_CNY",
      numberFromEnv("LG_TRIAL_QUOTA_INPUT_PRICE_PER_MILLION_CNY", 0),
    ),
    outputPricePerMillionCny: numberFromEnv("LG_TRIAL_QUOTA_OUTPUT_PRICE_PER_MILLION_CNY", 0),
    updatedAt: DEFAULT_UPDATED_AT,
  }
}

function normalizeMoney(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(0, Math.round(numberValue * 1000000) / 1000000)
}

function normalizeUserBudgets(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const entries: Array<[string, number]> = []
  for (const [userId, rawBudget] of Object.entries(value)) {
    const normalizedUserId = userId.trim()
    const budget = normalizeMoney(rawBudget, -1)
    if (!normalizedUserId || budget < 0) continue
    entries.push([normalizedUserId, budget])
  }
  return Object.fromEntries(entries)
}

function normalizeSettings(value: unknown): TrialQuotaSettings {
  const defaults = defaultSettings()
  const raw = value && typeof value === "object" ? value as Partial<TrialQuotaSettings> : {}
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    totalBudgetCny: normalizeMoney(raw.totalBudgetCny, defaults.totalBudgetCny),
    perUserBudgetCny: normalizeMoney(raw.perUserBudgetCny, defaults.perUserBudgetCny),
    userBudgetsCny: normalizeUserBudgets(raw.userBudgetsCny),
    promptCacheHitPricePerMillionCny: normalizeMoney(
      raw.promptCacheHitPricePerMillionCny,
      defaults.promptCacheHitPricePerMillionCny,
    ),
    promptCacheMissPricePerMillionCny: normalizeMoney(
      raw.promptCacheMissPricePerMillionCny,
      normalizeMoney((raw as { inputPricePerMillionCny?: unknown }).inputPricePerMillionCny, defaults.promptCacheMissPricePerMillionCny),
    ),
    outputPricePerMillionCny: normalizeMoney(raw.outputPricePerMillionCny, defaults.outputPricePerMillionCny),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : defaults.updatedAt,
  }
}

async function withQuotaLock<T>(callback: () => Promise<T>): Promise<T> {
  const previous = quotaLock
  let release!: () => void
  quotaLock = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await callback()
  } finally {
    release()
  }
}

export function getPlatformDeepSeekApiKey(): string | null {
  return process.env.DEEPSEEK_PLATFORM_API_KEY || process.env.DEEPSEEK_API_KEY || null
}

export function isPlatformDeepSeekKeyConfigured(): boolean {
  return Boolean(getPlatformDeepSeekApiKey())
}

export function readTrialQuotaSettingsSync(): TrialQuotaSettings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(quotaSettingsPath(), "utf8")))
  } catch {
    return defaultSettings()
  }
}

export async function readTrialQuotaSettings(): Promise<TrialQuotaSettings> {
  try {
    return normalizeSettings(JSON.parse(await fsp.readFile(quotaSettingsPath(), "utf8")))
  } catch {
    return defaultSettings()
  }
}

export async function updateTrialQuotaSettings(input: TrialQuotaSettingsInput): Promise<TrialQuotaSettings> {
  return withQuotaLock(async () => {
    const existing = await readTrialQuotaSettings()
    const next = normalizeSettings({
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    })
    await fsp.mkdir(quotaDir(), { recursive: true })
    await fsp.writeFile(quotaSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8")
    return next
  })
}

function parseUsageLine(line: string): TrialQuotaUsageRecord | null {
  try {
    const raw = JSON.parse(line) as Partial<TrialQuotaUsageRecord>
    if (typeof raw.userId !== "string" || raw.source !== "platform") return null
    return {
      id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
      userId: raw.userId,
      provider: typeof raw.provider === "string" ? raw.provider : "deepseek",
      model: typeof raw.model === "string" ? raw.model : "unknown",
      source: "platform",
      promptTokens: normalizeTokenCount(raw.promptTokens),
      promptCacheHitTokens: normalizeTokenCount(raw.promptCacheHitTokens),
      promptCacheMissTokens: normalizeTokenCount(raw.promptCacheMissTokens ?? raw.promptTokens),
      completionTokens: normalizeTokenCount(raw.completionTokens),
      totalTokens: normalizeTokenCount(raw.totalTokens),
      estimatedCostCny: normalizeMoney(raw.estimatedCostCny, 0),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
      feature: typeof raw.feature === "string" ? raw.feature : "unknown",
    }
  } catch {
    return null
  }
}

function normalizeTokenCount(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0
  return Math.floor(numberValue)
}

function readUsageRecordsSync(): TrialQuotaUsageRecord[] {
  try {
    return fs.readFileSync(quotaUsagePath(), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(parseUsageLine)
      .filter((record): record is TrialQuotaUsageRecord => Boolean(record))
  } catch {
    return []
  }
}

function summarizeUsage(records: TrialQuotaUsageRecord[]) {
  const total = {
    promptTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostCny: 0,
    requestCount: 0,
  }
  const byUser = new Map<string, TrialQuotaUserUsage>()

  for (const record of records) {
    total.promptTokens += record.promptTokens
    total.promptCacheHitTokens += record.promptCacheHitTokens
    total.promptCacheMissTokens += record.promptCacheMissTokens
    total.completionTokens += record.completionTokens
    total.totalTokens += record.totalTokens
    total.estimatedCostCny += record.estimatedCostCny
    total.requestCount += 1

    const userUsage = byUser.get(record.userId) ?? {
      userId: record.userId,
      budgetCny: 0,
      remainingCny: 0,
      promptTokens: 0,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostCny: 0,
      requestCount: 0,
    }
    userUsage.promptTokens += record.promptTokens
    userUsage.promptCacheHitTokens += record.promptCacheHitTokens
    userUsage.promptCacheMissTokens += record.promptCacheMissTokens
    userUsage.completionTokens += record.completionTokens
    userUsage.totalTokens += record.totalTokens
    userUsage.estimatedCostCny += record.estimatedCostCny
    userUsage.requestCount += 1
    byUser.set(record.userId, userUsage)
  }

  total.estimatedCostCny = normalizeMoney(total.estimatedCostCny, 0)
  for (const userUsage of byUser.values()) {
    userUsage.estimatedCostCny = normalizeMoney(userUsage.estimatedCostCny, 0)
  }

  return { total, byUser: [...byUser.values()] }
}

export function getTrialQuotaUserBudgetCny(settings: TrialQuotaSettings, userId: string): number {
  return settings.userBudgetsCny[userId] ?? settings.perUserBudgetCny
}

function applyUserBudgets(
  byUser: TrialQuotaUserUsage[],
  settings: TrialQuotaSettings,
): TrialQuotaUserUsage[] {
  return byUser.map((userUsage) => {
    const budgetCny = getTrialQuotaUserBudgetCny(settings, userUsage.userId)
    return {
      ...userUsage,
      budgetCny,
      remainingCny: normalizeMoney(Math.max(0, budgetCny - userUsage.estimatedCostCny), 0),
    }
  })
}

function quotaHasPrices(settings: TrialQuotaSettings): boolean {
  return settings.promptCacheHitPricePerMillionCny > 0 ||
    settings.promptCacheMissPricePerMillionCny > 0 ||
    settings.outputPricePerMillionCny > 0
}

export function getTrialQuotaSummarySync(): TrialQuotaSummary {
  const settings = readTrialQuotaSettingsSync()
  const { total, byUser } = summarizeUsage(readUsageRecordsSync())
  const byUserWithBudgets = applyUserBudgets(byUser, settings)
  return {
    settings,
    platformApiKeyConfigured: isPlatformDeepSeekKeyConfigured(),
    enforcementEnabled: settings.enabled && isPlatformDeepSeekKeyConfigured() && quotaHasPrices(settings),
    total: {
      ...total,
      remainingCny: normalizeMoney(Math.max(0, settings.totalBudgetCny - total.estimatedCostCny), 0),
    },
    byUser: byUserWithBudgets,
  }
}

export function canUsePlatformTrialQuotaSync(userId = getCurrentUserId()): boolean {
  if (!userId || !isPlatformDeepSeekKeyConfigured()) return false
  const summary = getTrialQuotaSummarySync()
  if (!summary.enforcementEnabled) return false
  if (summary.total.estimatedCostCny >= summary.settings.totalBudgetCny) return false
  const userUsage = summary.byUser.find((item) => item.userId === userId)
  const userBudgetCny = getTrialQuotaUserBudgetCny(summary.settings, userId)
  const userUsedCny = userUsage?.estimatedCostCny ?? 0
  return userUsedCny < userBudgetCny
}

export async function getTrialQuotaSummary(): Promise<TrialQuotaSummary> {
  return getTrialQuotaSummarySync()
}

export function estimateTrialQuotaCostCny(settings: TrialQuotaSettings, usage: TokenUsage): number {
  const cacheHitTokens = normalizeTokenCount(usage.promptCacheHitTokens)
  const cacheMissTokens = normalizeTokenCount(usage.promptCacheMissTokens ?? Math.max(0, usage.promptTokens - cacheHitTokens))
  const cost = (cacheHitTokens / 1_000_000) * settings.promptCacheHitPricePerMillionCny +
    (cacheMissTokens / 1_000_000) * settings.promptCacheMissPricePerMillionCny +
    (usage.completionTokens / 1_000_000) * settings.outputPricePerMillionCny
  return normalizeMoney(cost, 0)
}

export async function recordPlatformTrialQuotaUsage(input: {
  userId?: string | null
  provider: string
  model: string
  usage: TokenUsage
  feature: string
}): Promise<void> {
  const userId = input.userId ?? getCurrentUserId()
  if (!userId) return
  const settings = readTrialQuotaSettingsSync()
  if (!settings.enabled) return

  const record: TrialQuotaUsageRecord = {
    id: crypto.randomUUID(),
    userId,
    provider: input.provider,
    model: input.model,
    source: "platform",
    promptTokens: normalizeTokenCount(input.usage.promptTokens),
    promptCacheHitTokens: normalizeTokenCount(input.usage.promptCacheHitTokens),
    promptCacheMissTokens: normalizeTokenCount(
      input.usage.promptCacheMissTokens ?? Math.max(0, input.usage.promptTokens - normalizeTokenCount(input.usage.promptCacheHitTokens)),
    ),
    completionTokens: normalizeTokenCount(input.usage.completionTokens),
    totalTokens: normalizeTokenCount(input.usage.totalTokens),
    estimatedCostCny: estimateTrialQuotaCostCny(settings, input.usage),
    createdAt: new Date().toISOString(),
    feature: input.feature,
  }
  await withQuotaLock(async () => {
    await fsp.mkdir(quotaDir(), { recursive: true })
    await fsp.appendFile(quotaUsagePath(), `${JSON.stringify(record)}\n`, "utf8")
  })
}
