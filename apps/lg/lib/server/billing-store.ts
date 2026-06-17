import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import {
  BILLING_SUBSCRIPTION_PLANS,
  type BillingAdminSummary,
  type BillingLedgerEntry,
  type BillingPlatformKeyStatus,
  type BillingPlatformProvider,
  type BillingPlatformProviderProtocol,
  type BillingPricing,
  type BillingSettings,
  type BillingSettingsUpdateInput,
  type BillingUsageRangePayload,
  type BillingUsageDetails,
  type BillingUserSummary,
  type PaymentSource,
} from "@/lib/billing"
import { getCurrentUserId } from "@/lib/server/request-context"
import { getGlobalDataRoot } from "@/lib/server/paths"
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/server/secret-crypto"

const BILLING_SETTINGS_FILE = "billing-settings.json"
const BILLING_LEDGER_FILE = "billing-ledger.jsonl"
const PLATFORM_LLM_SETTINGS_FILE = "platform-llm-settings.json"
const LEGACY_SETTINGS_FILE = "quota-settings.json"
const LEGACY_USAGE_FILE = "quota-usage.jsonl"
const AUTH_FILE = "auth.json"
const DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z"

type TokenUsage = {
  promptTokens: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
  completionTokens: number
  totalTokens: number
}

type LegacyBalanceSettingsShape = {
  enabled: boolean
  perUserBudgetCny: number
  userBudgetsCny: Record<string, number>
  promptCacheHitPricePerMillionCny: number
  promptCacheMissPricePerMillionCny: number
  outputPricePerMillionCny: number
}

type LegacyBalanceUsageRecordShape = {
  userId: string
  provider: string
  model: string
  promptTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostCny: number
  createdAt: string
  feature: string
}

type StoredPlatformLlmSettings = {
  activeProviderId?: string
  providers?: StoredPlatformProvider[]
  deepSeekApiKeyEncrypted?: string
  deepSeekKeyPreview?: string
  deepSeekKeyUpdatedAt?: string
  updatedAt: string
}

type StoredPlatformProvider = {
  id: string
  label: string
  provider: string
  protocol: BillingPlatformProviderProtocol
  baseUrl: string
  modelId: string
  apiKeyEncrypted?: string
  keyPreview?: string
  keyUpdatedAt?: string
  createdAt: string
  updatedAt: string
}

export type EffectivePlatformBillingConfig = {
  id: string
  label: string
  provider: string
  protocol: BillingPlatformProviderProtocol
  apiKey: string
  baseUrl: string
  model: string
}

export type PlatformBillingProviderInput = {
  id?: unknown
  label?: unknown
  provider?: unknown
  baseUrl?: unknown
  modelId?: unknown
  apiKey?: unknown
  setActive?: unknown
}

let billingLock: Promise<void> = Promise.resolve()

function adminDir(): string {
  return path.join(getGlobalDataRoot(), "admin")
}

function billingSettingsPath(): string {
  return path.join(adminDir(), BILLING_SETTINGS_FILE)
}

function billingLedgerPath(): string {
  return path.join(adminDir(), BILLING_LEDGER_FILE)
}

function platformLlmSettingsPath(): string {
  return path.join(adminDir(), PLATFORM_LLM_SETTINGS_FILE)
}

function legacySettingsPath(): string {
  return path.join(adminDir(), LEGACY_SETTINGS_FILE)
}

function legacyUsagePath(): string {
  return path.join(adminDir(), LEGACY_USAGE_FILE)
}

function authPath(): string {
  return path.join(getGlobalDataRoot(), "auth", AUTH_FILE)
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeMoney(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.round(numberValue * 1_000_000) / 1_000_000
}

function normalizeNonNegativeMoney(value: unknown, fallback: number): number {
  return Math.max(0, normalizeMoney(value, fallback))
}

function normalizeTokenCount(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0
  return Math.floor(numberValue)
}

function defaultLegacyBalanceSettings(): LegacyBalanceSettingsShape {
  return {
    enabled: process.env.LG_TRIAL_QUOTA_ENABLED === "true",
    perUserBudgetCny: numberFromEnv("LG_TRIAL_QUOTA_PER_USER_CNY", 2),
    userBudgetsCny: {},
    promptCacheHitPricePerMillionCny: numberFromEnv("LG_TRIAL_QUOTA_CACHE_HIT_PRICE_PER_MILLION_CNY", 0),
    promptCacheMissPricePerMillionCny: numberFromEnv(
      "LG_TRIAL_QUOTA_CACHE_MISS_PRICE_PER_MILLION_CNY",
      numberFromEnv("LG_TRIAL_QUOTA_INPUT_PRICE_PER_MILLION_CNY", 0),
    ),
    outputPricePerMillionCny: numberFromEnv("LG_TRIAL_QUOTA_OUTPUT_PRICE_PER_MILLION_CNY", 0),
  }
}

function normalizeUserBudgets(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([userId, rawBudget]) => {
    const normalizedUserId = userId.trim()
    const budget = normalizeNonNegativeMoney(rawBudget, -1)
    return normalizedUserId && budget >= 0 ? [[normalizedUserId, budget]] : []
  }))
}

function readLegacyBalanceSettingsSync(): LegacyBalanceSettingsShape {
  const defaults = defaultLegacyBalanceSettings()
  try {
    const raw = JSON.parse(fs.readFileSync(legacySettingsPath(), "utf8")) as Partial<LegacyBalanceSettingsShape> & {
      inputPricePerMillionCny?: unknown
    }
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
      perUserBudgetCny: normalizeNonNegativeMoney(raw.perUserBudgetCny, defaults.perUserBudgetCny),
      userBudgetsCny: normalizeUserBudgets(raw.userBudgetsCny),
      promptCacheHitPricePerMillionCny: normalizeNonNegativeMoney(
        raw.promptCacheHitPricePerMillionCny,
        defaults.promptCacheHitPricePerMillionCny,
      ),
      promptCacheMissPricePerMillionCny: normalizeNonNegativeMoney(
        raw.promptCacheMissPricePerMillionCny,
        normalizeNonNegativeMoney(raw.inputPricePerMillionCny, defaults.promptCacheMissPricePerMillionCny),
      ),
      outputPricePerMillionCny: normalizeNonNegativeMoney(raw.outputPricePerMillionCny, defaults.outputPricePerMillionCny),
    }
  } catch {
    return defaults
  }
}

function pricingFromLegacyBalance(settings = readLegacyBalanceSettingsSync()): BillingPricing {
  return {
    promptCacheHitPricePerMillionCny: settings.promptCacheHitPricePerMillionCny,
    promptCacheMissPricePerMillionCny: settings.promptCacheMissPricePerMillionCny,
    outputPricePerMillionCny: settings.outputPricePerMillionCny,
  }
}

function defaultBillingSettings(): BillingSettings {
  const legacySettings = readLegacyBalanceSettingsSync()
  return {
    version: 1,
    mode: "trial",
    platformEnabled: legacySettings.enabled,
    pricing: pricingFromLegacyBalance(legacySettings),
    subscriptionPlans: BILLING_SUBSCRIPTION_PLANS,
    updatedAt: DEFAULT_UPDATED_AT,
  }
}

function normalizePricing(value: unknown, fallback = pricingFromLegacyBalance()): BillingPricing {
  const raw = value && typeof value === "object" ? value as Partial<BillingPricing> : {}
  return {
    promptCacheHitPricePerMillionCny: normalizeNonNegativeMoney(
      raw.promptCacheHitPricePerMillionCny,
      fallback.promptCacheHitPricePerMillionCny,
    ),
    promptCacheMissPricePerMillionCny: normalizeNonNegativeMoney(
      raw.promptCacheMissPricePerMillionCny,
      fallback.promptCacheMissPricePerMillionCny,
    ),
    outputPricePerMillionCny: normalizeNonNegativeMoney(
      raw.outputPricePerMillionCny,
      fallback.outputPricePerMillionCny,
    ),
  }
}

function normalizeBillingSettings(value: unknown): BillingSettings {
  const defaults = defaultBillingSettings()
  const raw = value && typeof value === "object" ? value as Partial<BillingSettings> : {}
  return {
    version: 1,
    mode: raw.mode === "subscription" ? "subscription" : "trial",
    platformEnabled: typeof raw.platformEnabled === "boolean" ? raw.platformEnabled : defaults.platformEnabled,
    pricing: normalizePricing(raw.pricing, defaults.pricing),
    subscriptionPlans: BILLING_SUBSCRIPTION_PLANS,
    migratedLegacyBalanceAt: typeof raw.migratedLegacyBalanceAt === "string" ? raw.migratedLegacyBalanceAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : defaults.updatedAt,
  }
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function createProviderId(): string {
  return `platform-${crypto.randomUUID()}`
}

function defaultPlatformBaseUrl(): string {
  return process.env.DEEPSEEK_PLATFORM_BASE_URL ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
}

function defaultPlatformModel(): string {
  return process.env.DEEPSEEK_PLATFORM_MODEL ?? process.env.NG_MODEL ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash"
}

function defaultDeepSeekPlatformProvider(input: {
  apiKeyEncrypted?: string
  keyPreview?: string
  keyUpdatedAt?: string
  sourceUpdatedAt?: string
}): StoredPlatformProvider {
  const updatedAt = input.sourceUpdatedAt ?? input.keyUpdatedAt ?? DEFAULT_UPDATED_AT
  return {
    id: "deepseek-default",
    label: "DeepSeek 默认",
    provider: "deepseek",
    protocol: "openai-compatible",
    baseUrl: defaultPlatformBaseUrl(),
    modelId: defaultPlatformModel(),
    apiKeyEncrypted: input.apiKeyEncrypted,
    keyPreview: input.keyPreview,
    keyUpdatedAt: input.keyUpdatedAt,
    createdAt: updatedAt,
    updatedAt,
  }
}

function normalizeStoredPlatformProvider(data: unknown, fallbackUpdatedAt = DEFAULT_UPDATED_AT): StoredPlatformProvider | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const raw = data as Partial<StoredPlatformProvider>
  const id = stringOrEmpty(raw.id)
  const label = stringOrEmpty(raw.label)
  const provider = stringOrEmpty(raw.provider)
  const baseUrl = stringOrEmpty(raw.baseUrl)
  const modelId = stringOrEmpty(raw.modelId)
  if (!id || !label || !provider || !baseUrl || !modelId) return null
  return {
    id,
    label,
    provider,
    protocol: raw.protocol === "openai-compatible" ? "openai-compatible" : "openai-compatible",
    baseUrl,
    modelId,
    apiKeyEncrypted: typeof raw.apiKeyEncrypted === "string" && raw.apiKeyEncrypted ? raw.apiKeyEncrypted : undefined,
    keyPreview: typeof raw.keyPreview === "string" && raw.keyPreview ? raw.keyPreview : undefined,
    keyUpdatedAt: typeof raw.keyUpdatedAt === "string" ? raw.keyUpdatedAt : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallbackUpdatedAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallbackUpdatedAt,
  }
}

function normalizePlatformProviders(data: unknown, fallbackUpdatedAt = DEFAULT_UPDATED_AT): StoredPlatformProvider[] {
  if (!Array.isArray(data)) return []
  const byId = new Map<string, StoredPlatformProvider>()
  for (const item of data) {
    const provider = normalizeStoredPlatformProvider(item, fallbackUpdatedAt)
    if (provider) byId.set(provider.id, provider)
  }
  return [...byId.values()]
}

function normalizePlatformLlmSettings(value: unknown): StoredPlatformLlmSettings {
  const raw = value && typeof value === "object" ? value as Partial<StoredPlatformLlmSettings> : {}
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_UPDATED_AT
  const providers = normalizePlatformProviders(raw.providers, updatedAt)

  if (typeof raw.deepSeekApiKeyEncrypted === "string" && raw.deepSeekApiKeyEncrypted) {
    const legacy = defaultDeepSeekPlatformProvider({
      apiKeyEncrypted: raw.deepSeekApiKeyEncrypted,
      keyPreview: typeof raw.deepSeekKeyPreview === "string" ? raw.deepSeekKeyPreview : undefined,
      keyUpdatedAt: typeof raw.deepSeekKeyUpdatedAt === "string" ? raw.deepSeekKeyUpdatedAt : undefined,
      sourceUpdatedAt: updatedAt,
    })
    if (!providers.some((provider) => provider.id === legacy.id)) providers.unshift(legacy)
  }

  const activeProviderId = typeof raw.activeProviderId === "string" &&
    providers.some((provider) => provider.id === raw.activeProviderId)
    ? raw.activeProviderId
    : providers[0]?.id

  return {
    activeProviderId,
    providers,
    deepSeekApiKeyEncrypted: typeof raw.deepSeekApiKeyEncrypted === "string"
      ? raw.deepSeekApiKeyEncrypted
      : undefined,
    deepSeekKeyPreview: typeof raw.deepSeekKeyPreview === "string" ? raw.deepSeekKeyPreview : undefined,
    deepSeekKeyUpdatedAt: typeof raw.deepSeekKeyUpdatedAt === "string" ? raw.deepSeekKeyUpdatedAt : undefined,
    updatedAt,
  }
}

function readPlatformLlmSettingsSync(): StoredPlatformLlmSettings {
  try {
    return normalizePlatformLlmSettings(JSON.parse(fs.readFileSync(platformLlmSettingsPath(), "utf8")))
  } catch {
    return { updatedAt: DEFAULT_UPDATED_AT }
  }
}

function getEnvironmentPlatformProvider(): EffectivePlatformBillingConfig | null {
  const apiKey = process.env.DEEPSEEK_PLATFORM_API_KEY || process.env.DEEPSEEK_API_KEY || null
  if (!apiKey) return null
  return {
    id: "deepseek-env",
    label: "DeepSeek 环境变量",
    provider: "deepseek",
    protocol: "openai-compatible",
    apiKey,
    baseUrl: defaultPlatformBaseUrl(),
    model: defaultPlatformModel(),
  }
}

function decryptStoredPlatformProvider(provider: StoredPlatformProvider | undefined): EffectivePlatformBillingConfig | null {
  if (!provider?.apiKeyEncrypted) return null
  try {
    return {
      id: provider.id,
      label: provider.label,
      provider: provider.provider,
      protocol: provider.protocol,
      apiKey: decryptSecret(provider.apiKeyEncrypted),
      baseUrl: provider.baseUrl,
      model: provider.modelId,
    }
  } catch (error) {
    console.error("[billing-store] Failed to decrypt platform API key:", error)
    return null
  }
}

function getActiveStoredPlatformProvider(settings = readPlatformLlmSettingsSync()): StoredPlatformProvider | undefined {
  return settings.providers?.find((provider) => provider.id === settings.activeProviderId) ?? settings.providers?.[0]
}

function publicPlatformProvider(provider: StoredPlatformProvider, source: "admin" | "environment"): BillingPlatformProvider {
  return {
    id: provider.id,
    label: provider.label,
    provider: provider.provider,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    modelId: provider.modelId,
    configured: Boolean(provider.apiKeyEncrypted),
    keyPreview: provider.keyPreview ?? null,
    keyUpdatedAt: provider.keyUpdatedAt ?? null,
    source,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  }
}

function environmentPlatformProviderStatus(config: EffectivePlatformBillingConfig): BillingPlatformProvider {
  return {
    id: config.id,
    label: config.label,
    provider: config.provider,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    modelId: config.model,
    configured: true,
    keyPreview: null,
    keyUpdatedAt: null,
    source: "environment",
    createdAt: DEFAULT_UPDATED_AT,
    updatedAt: DEFAULT_UPDATED_AT,
  }
}

function getPlatformKeyStatus(): BillingPlatformKeyStatus {
  const settings = readPlatformLlmSettingsSync()
  const storedProviders = settings.providers ?? []
  const activeStoredProvider = getActiveStoredPlatformProvider(settings)
  const activeStoredConfig = decryptStoredPlatformProvider(activeStoredProvider)
  const environmentConfig = getEnvironmentPlatformProvider()
  const activeConfig = activeStoredConfig ?? environmentConfig
  const activePublicProvider = activeStoredConfig && activeStoredProvider
    ? publicPlatformProvider(activeStoredProvider, "admin")
    : environmentConfig
      ? environmentPlatformProviderStatus(environmentConfig)
      : null
  const providers = [
    ...storedProviders.map((provider) => publicPlatformProvider(provider, "admin")),
    ...(environmentConfig && !storedProviders.some((provider) => provider.id === environmentConfig.id)
      ? [environmentPlatformProviderStatus(environmentConfig)]
      : []),
  ]

  if (activeConfig && activePublicProvider) {
    return {
      platformApiKeyConfigured: true,
      platformKeySource: activePublicProvider.source,
      platformKeyPreview: activePublicProvider.keyPreview,
      platformKeyUpdatedAt: activePublicProvider.keyUpdatedAt,
      activePlatformProviderId: activePublicProvider.id,
      activePlatformProvider: activePublicProvider,
      platformProviders: providers,
    }
  }

  return {
    platformApiKeyConfigured: false,
    platformKeySource: "none",
    platformKeyPreview: null,
    platformKeyUpdatedAt: null,
    activePlatformProviderId: null,
    activePlatformProvider: null,
    platformProviders: providers,
  }
}

function parseLegacyUsageLine(line: string): LegacyBalanceUsageRecordShape | null {
  try {
    const raw = JSON.parse(line) as Partial<LegacyBalanceUsageRecordShape> & { source?: unknown }
    if (typeof raw.userId !== "string" || raw.source !== "platform") return null
    return {
      userId: raw.userId,
      provider: typeof raw.provider === "string" ? raw.provider : "deepseek",
      model: typeof raw.model === "string" ? raw.model : "unknown",
      promptTokens: normalizeTokenCount(raw.promptTokens),
      promptCacheHitTokens: normalizeTokenCount(raw.promptCacheHitTokens),
      promptCacheMissTokens: normalizeTokenCount(raw.promptCacheMissTokens ?? raw.promptTokens),
      completionTokens: normalizeTokenCount(raw.completionTokens),
      totalTokens: normalizeTokenCount(raw.totalTokens),
      estimatedCostCny: normalizeNonNegativeMoney(raw.estimatedCostCny, 0),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
      feature: typeof raw.feature === "string" ? raw.feature : "unknown",
    }
  } catch {
    return null
  }
}

function readLegacyUsageRecordsSync(): LegacyBalanceUsageRecordShape[] {
  try {
    return fs.readFileSync(legacyUsagePath(), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(parseLegacyUsageLine)
      .filter((record): record is LegacyBalanceUsageRecordShape => Boolean(record))
  } catch {
    return []
  }
}

function readAuthUserIdsSync(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(authPath(), "utf8")) as { users?: Array<{ id?: unknown }> }
    return Array.isArray(raw.users)
      ? raw.users.flatMap((user) => typeof user.id === "string" && user.id ? [user.id] : [])
      : []
  } catch {
    return []
  }
}

function createMigrationLedger(settings: LegacyBalanceSettingsShape): BillingLedgerEntry[] {
  const now = new Date().toISOString()
  const legacyUsage = readLegacyUsageRecordsSync().sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const userIds = new Set([
    ...readAuthUserIdsSync(),
    ...Object.keys(settings.userBudgetsCny),
    ...legacyUsage.map((record) => record.userId),
  ].filter(Boolean))
  const balances = new Map<string, number>()
  const entries: BillingLedgerEntry[] = []

  for (const userId of [...userIds].sort()) {
    const budgetCny = normalizeNonNegativeMoney(settings.userBudgetsCny[userId] ?? settings.perUserBudgetCny, 0)
    balances.set(userId, budgetCny)
    if (budgetCny <= 0) continue
    entries.push({
      id: crypto.randomUUID(),
      userId,
      type: "balance_migration",
      amountCny: budgetCny,
      balanceAfterCny: budgetCny,
      note: "Migrated from legacy balance budget",
      createdByUserId: null,
      createdAt: now,
    })
  }

  for (const record of legacyUsage) {
    const currentBalance = balances.get(record.userId) ?? 0
    const nextBalance = normalizeMoney(currentBalance - record.estimatedCostCny, 0)
    balances.set(record.userId, nextBalance)
    entries.push({
      id: crypto.randomUUID(),
      userId: record.userId,
      type: "usage",
      amountCny: -record.estimatedCostCny,
      paymentSource: "balance",
      provider: record.provider,
      model: record.model,
      feature: record.feature,
      promptTokens: record.promptTokens,
      promptCacheHitTokens: record.promptCacheHitTokens,
      promptCacheMissTokens: record.promptCacheMissTokens,
      completionTokens: record.completionTokens,
      totalTokens: record.totalTokens,
      estimatedCostCny: record.estimatedCostCny,
      chargedAmountCny: record.estimatedCostCny,
      commissionAmountCny: 0,
      balanceAfterCny: nextBalance,
      note: "Migrated from legacy balance usage",
      createdByUserId: null,
      createdAt: record.createdAt,
    })
  }

  return entries
}

function ensureBillingInitializedSync(): void {
  const settingsExists = fs.existsSync(billingSettingsPath())
  const ledgerExists = fs.existsSync(billingLedgerPath())
  if (settingsExists && ledgerExists) return

  fs.mkdirSync(adminDir(), { recursive: true })

  if (!settingsExists) {
    const settings = {
      ...defaultBillingSettings(),
      migratedLegacyBalanceAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(billingSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  }

  if (!ledgerExists) {
    const settings = readLegacyBalanceSettingsSync()
    const entries = createMigrationLedger(settings)
    const content = entries.map((entry) => JSON.stringify(entry)).join("\n")
    fs.writeFileSync(billingLedgerPath(), content ? `${content}\n` : "", "utf8")
  }
}

async function withBillingLock<T>(callback: () => Promise<T>): Promise<T> {
  const previous = billingLock
  let release!: () => void
  billingLock = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    ensureBillingInitializedSync()
    return await callback()
  } finally {
    release()
  }
}

function parseBillingEntryLine(line: string): BillingLedgerEntry | null {
  try {
    const raw = JSON.parse(line) as Partial<Omit<BillingLedgerEntry, "type">> & {
      type?: BillingLedgerEntry["type"] | "trial_migration"
    }
    if (typeof raw.userId !== "string" || typeof raw.id !== "string") return null
    const type = raw.type === "credit_adjustment" ||
      raw.type === "debit_adjustment" ||
      raw.type === "usage" ||
      raw.type === "usage_estimate" ||
      raw.type === "balance_migration" ||
      raw.type === "trial_migration"
      ? raw.type === "trial_migration" ? "balance_migration" : raw.type
      : "usage_estimate"
    const paymentSource = raw.paymentSource === "balance" || raw.paymentSource === "api" ? raw.paymentSource : undefined
    return {
      id: raw.id,
      userId: raw.userId,
      type,
      amountCny: normalizeMoney(raw.amountCny, 0),
      balanceAfterCny: typeof raw.balanceAfterCny === "number" ? normalizeMoney(raw.balanceAfterCny, 0) : null,
      paymentSource,
      provider: typeof raw.provider === "string" ? raw.provider : undefined,
      model: typeof raw.model === "string" ? raw.model : undefined,
      feature: typeof raw.feature === "string" ? raw.feature : undefined,
      promptTokens: normalizeTokenCount(raw.promptTokens),
      promptCacheHitTokens: normalizeTokenCount(raw.promptCacheHitTokens),
      promptCacheMissTokens: normalizeTokenCount(raw.promptCacheMissTokens),
      completionTokens: normalizeTokenCount(raw.completionTokens),
      totalTokens: normalizeTokenCount(raw.totalTokens),
      estimatedCostCny: normalizeNonNegativeMoney(raw.estimatedCostCny, 0),
      chargedAmountCny: normalizeNonNegativeMoney(raw.chargedAmountCny, 0),
      commissionAmountCny: normalizeNonNegativeMoney(raw.commissionAmountCny, 0),
      note: typeof raw.note === "string" ? raw.note : undefined,
      createdByUserId: typeof raw.createdByUserId === "string" ? raw.createdByUserId : null,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

function readBillingSettingsSyncRaw(): BillingSettings {
  ensureBillingInitializedSync()
  try {
    return normalizeBillingSettings(JSON.parse(fs.readFileSync(billingSettingsPath(), "utf8")))
  } catch {
    return defaultBillingSettings()
  }
}

function readBillingEntriesSync(): BillingLedgerEntry[] {
  ensureBillingInitializedSync()
  try {
    return fs.readFileSync(billingLedgerPath(), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(parseBillingEntryLine)
      .filter((entry): entry is BillingLedgerEntry => Boolean(entry))
  } catch {
    return []
  }
}

async function appendBillingEntry(entry: BillingLedgerEntry): Promise<void> {
  await fsp.mkdir(adminDir(), { recursive: true })
  await fsp.appendFile(billingLedgerPath(), `${JSON.stringify(entry)}\n`, "utf8")
}

export function getPlatformBillingConfig(): EffectivePlatformBillingConfig | null {
  const settings = readPlatformLlmSettingsSync()
  return decryptStoredPlatformProvider(getActiveStoredPlatformProvider(settings)) ?? getEnvironmentPlatformProvider()
}

export function getPlatformBillingConfigById(providerIdInput: unknown): EffectivePlatformBillingConfig | null {
  const providerId = stringOrEmpty(providerIdInput)
  if (!providerId) return null
  const settings = readPlatformLlmSettingsSync()
  const storedProvider = settings.providers?.find((provider) => provider.id === providerId)
  const storedConfig = decryptStoredPlatformProvider(storedProvider)
  if (storedConfig) return storedConfig
  const environmentConfig = getEnvironmentPlatformProvider()
  return environmentConfig?.id === providerId ? environmentConfig : null
}

export function getPlatformBillingApiKey(): EffectivePlatformBillingConfig | null {
  return getPlatformBillingConfig()
}

export function getBillingPlatformKeyStatus(): BillingPlatformKeyStatus {
  return getPlatformKeyStatus()
}

function isPlatformApiKeyConfigured(): boolean {
  return getPlatformKeyStatus().platformApiKeyConfigured
}

export function readBillingSettingsSync(): BillingSettings {
  return readBillingSettingsSyncRaw()
}

export async function readBillingSettings(): Promise<BillingSettings> {
  return readBillingSettingsSyncRaw()
}

export async function updateBillingSettings(input: BillingSettingsUpdateInput): Promise<BillingSettings> {
  return withBillingLock(async () => {
    const existing = readBillingSettingsSyncRaw()
    const next: BillingSettings = {
      ...existing,
      platformEnabled: typeof input.platformEnabled === "boolean" ? input.platformEnabled : existing.platformEnabled,
      pricing: input.pricing ? normalizePricing(input.pricing, existing.pricing) : existing.pricing,
      updatedAt: new Date().toISOString(),
    }
    await fsp.mkdir(adminDir(), { recursive: true })
    await fsp.writeFile(billingSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8")
    return next
  })
}

export async function savePlatformBillingProvider(input: PlatformBillingProviderInput): Promise<BillingPlatformKeyStatus> {
  const label = stringOrEmpty(input.label)
  const provider = stringOrEmpty(input.provider)
  const baseUrl = stringOrEmpty(input.baseUrl)
  const modelId = stringOrEmpty(input.modelId)
  const apiKey = stringOrEmpty(input.apiKey)
  const requestedId = stringOrEmpty(input.id)
  if (!label || !provider || !baseUrl || !modelId) throw new Error("invalid_platform_provider")

  return withBillingLock(async () => {
    const existingSettings = readPlatformLlmSettingsSync()
    const existing = requestedId
      ? existingSettings.providers?.find((item) => item.id === requestedId)
      : undefined
    if (!existing && !apiKey) throw new Error("missing_api_key")
    const now = new Date().toISOString()
    const id = existing?.id ?? (requestedId || createProviderId())
    const nextProvider: StoredPlatformProvider = {
      id,
      label,
      provider,
      protocol: "openai-compatible",
      baseUrl,
      modelId,
      apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : existing?.apiKeyEncrypted,
      keyPreview: apiKey ? maskSecret(apiKey) : existing?.keyPreview,
      keyUpdatedAt: apiKey ? now : existing?.keyUpdatedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const providers = [
      ...(existingSettings.providers ?? []).filter((item) => item.id !== id),
      nextProvider,
    ]
    const shouldSetActive = input.setActive !== false
    const settings: StoredPlatformLlmSettings = {
      activeProviderId: shouldSetActive ? id : existingSettings.activeProviderId ?? providers[0]?.id,
      providers,
      updatedAt: now,
    }
    await fsp.mkdir(adminDir(), { recursive: true })
    await fsp.writeFile(platformLlmSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8")
    return getPlatformKeyStatus()
  })
}

export async function savePlatformBillingApiKey(apiKeyInput: string): Promise<BillingPlatformKeyStatus> {
  return savePlatformBillingProvider({
    id: "deepseek-default",
    label: "DeepSeek 默认",
    provider: "deepseek",
    baseUrl: defaultPlatformBaseUrl(),
    modelId: defaultPlatformModel(),
    apiKey: apiKeyInput,
    setActive: true,
  })
}

export async function deletePlatformBillingProvider(providerIdInput: unknown): Promise<BillingPlatformKeyStatus> {
  const providerId = stringOrEmpty(providerIdInput)
  if (!providerId) throw new Error("missing_platform_provider_id")

  return withBillingLock(async () => {
    const existing = readPlatformLlmSettingsSync()
    const providers = (existing.providers ?? []).filter((provider) => provider.id !== providerId)
    const activeProviderId = existing.activeProviderId === providerId
      ? providers[0]?.id
      : existing.activeProviderId && providers.some((provider) => provider.id === existing.activeProviderId)
        ? existing.activeProviderId
        : providers[0]?.id
    const settings: StoredPlatformLlmSettings = {
      activeProviderId,
      providers,
      updatedAt: new Date().toISOString(),
    }
    await fsp.mkdir(adminDir(), { recursive: true })
    await fsp.writeFile(platformLlmSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8")
    return getPlatformKeyStatus()
  })
}

export async function clearPlatformBillingApiKey(): Promise<BillingPlatformKeyStatus> {
  const activeId = readPlatformLlmSettingsSync().activeProviderId
  if (!activeId) return getPlatformKeyStatus()
  return deletePlatformBillingProvider(activeId)
}

function commissionRateForSettings(settings: BillingSettings): number {
  if (settings.mode !== "subscription") return 0
  return 0
}

export function estimateBillingCostCny(settings: BillingSettings, usage: TokenUsage): number {
  const promptCacheHitTokens = normalizeTokenCount(usage.promptCacheHitTokens)
  const promptCacheMissTokens = normalizeTokenCount(
    usage.promptCacheMissTokens ?? Math.max(0, normalizeTokenCount(usage.promptTokens) - promptCacheHitTokens),
  )
  const completionTokens = normalizeTokenCount(usage.completionTokens)
  const pricing = settings.pricing
  const cost = (promptCacheHitTokens / 1_000_000) * pricing.promptCacheHitPricePerMillionCny +
    (promptCacheMissTokens / 1_000_000) * pricing.promptCacheMissPricePerMillionCny +
    (completionTokens / 1_000_000) * pricing.outputPricePerMillionCny
  return normalizeNonNegativeMoney(cost, 0)
}

function aggregateUserSummary(
  userId: string,
  entries: BillingLedgerEntry[],
  settings: BillingSettings,
): BillingUserSummary {
  const userEntries = entries
    .filter((entry) => entry.userId === userId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const usageEntries = userEntries.filter((entry) => entry.type === "usage" || entry.type === "usage_estimate")
  const balanceCny = normalizeMoney(userEntries.reduce((sum, entry) => sum + entry.amountCny, 0), 0)
  const platformApiKeyConfigured = isPlatformApiKeyConfigured()

  return {
    userId,
    balanceCny,
    usedBalanceCny: normalizeNonNegativeMoney(
      usageEntries
        .filter((entry) => entry.paymentSource === "balance")
        .reduce((sum, entry) => sum + (entry.chargedAmountCny ?? 0), 0),
      0,
    ),
    estimatedCostCny: normalizeNonNegativeMoney(
      usageEntries.reduce((sum, entry) => sum + (entry.estimatedCostCny ?? 0), 0),
      0,
    ),
    apiEstimatedCostCny: normalizeNonNegativeMoney(
      usageEntries
        .filter((entry) => entry.paymentSource === "api")
        .reduce((sum, entry) => sum + (entry.estimatedCostCny ?? 0), 0),
      0,
    ),
    requestCount: usageEntries.length,
    promptTokens: usageEntries.reduce((sum, entry) => sum + normalizeTokenCount(entry.promptTokens), 0),
    promptCacheHitTokens: usageEntries.reduce((sum, entry) => sum + normalizeTokenCount(entry.promptCacheHitTokens), 0),
    promptCacheMissTokens: usageEntries.reduce((sum, entry) => sum + normalizeTokenCount(entry.promptCacheMissTokens), 0),
    completionTokens: usageEntries.reduce((sum, entry) => sum + normalizeTokenCount(entry.completionTokens), 0),
    totalTokens: usageEntries.reduce((sum, entry) => sum + normalizeTokenCount(entry.totalTokens), 0),
    canUseBalance: settings.platformEnabled && platformApiKeyConfigured && balanceCny > 0,
    platformApiKeyConfigured,
    platformEnabled: settings.platformEnabled,
    recentEntries: [...userEntries].reverse().slice(0, 12),
  }
}

export function getBillingUserSummarySync(userId = getCurrentUserId()): BillingUserSummary | null {
  if (!userId) return null
  const settings = readBillingSettingsSyncRaw()
  return aggregateUserSummary(userId, readBillingEntriesSync(), settings)
}

export async function getBillingUserSummary(userId = getCurrentUserId()): Promise<BillingUserSummary | null> {
  return getBillingUserSummarySync(userId)
}

export function canUseBalanceBillingSync(userId = getCurrentUserId()): boolean {
  return Boolean(getBillingUserSummarySync(userId)?.canUseBalance)
}

function createTotalSummary(byUser: BillingUserSummary[]): BillingAdminSummary["total"] {
  return {
    balanceCny: normalizeMoney(byUser.reduce((sum, user) => sum + user.balanceCny, 0), 0),
    usedBalanceCny: normalizeNonNegativeMoney(byUser.reduce((sum, user) => sum + user.usedBalanceCny, 0), 0),
    estimatedCostCny: normalizeNonNegativeMoney(byUser.reduce((sum, user) => sum + user.estimatedCostCny, 0), 0),
    apiEstimatedCostCny: normalizeNonNegativeMoney(byUser.reduce((sum, user) => sum + user.apiEstimatedCostCny, 0), 0),
    requestCount: byUser.reduce((sum, user) => sum + user.requestCount, 0),
    promptTokens: byUser.reduce((sum, user) => sum + user.promptTokens, 0),
    promptCacheHitTokens: byUser.reduce((sum, user) => sum + user.promptCacheHitTokens, 0),
    promptCacheMissTokens: byUser.reduce((sum, user) => sum + user.promptCacheMissTokens, 0),
    completionTokens: byUser.reduce((sum, user) => sum + user.completionTokens, 0),
    totalTokens: byUser.reduce((sum, user) => sum + user.totalTokens, 0),
  }
}

export function getBillingAdminSummarySync(userIds: string[] = []): BillingAdminSummary {
  const settings = readBillingSettingsSyncRaw()
  const entries = readBillingEntriesSync()
  const platformKeyStatus = getPlatformKeyStatus()
  const allUserIds = [...new Set([
    ...userIds,
    ...entries.map((entry) => entry.userId),
  ].filter(Boolean))].sort()
  const byUser = allUserIds.map((userId) => aggregateUserSummary(userId, entries, settings))

  return {
    settings,
    platformApiKeyConfigured: platformKeyStatus.platformApiKeyConfigured,
    platformKeySource: platformKeyStatus.platformKeySource,
    platformKeyPreview: platformKeyStatus.platformKeyPreview,
    platformKeyUpdatedAt: platformKeyStatus.platformKeyUpdatedAt,
    activePlatformProviderId: platformKeyStatus.activePlatformProviderId,
    activePlatformProvider: platformKeyStatus.activePlatformProvider,
    platformProviders: platformKeyStatus.platformProviders,
    total: createTotalSummary(byUser),
    byUser,
  }
}

export async function getBillingAdminSummary(userIds: string[] = []): Promise<BillingAdminSummary> {
  return getBillingAdminSummarySync(userIds)
}

function parseRangeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isUsageLedgerEntry(entry: BillingLedgerEntry): boolean {
  return entry.type === "usage" || entry.type === "usage_estimate"
}

function summarizeUsageRange(
  entries: BillingLedgerEntry[],
  from: string | null,
  to: string | null,
): BillingUsageRangePayload["summary"] {
  return {
    from,
    to,
    promptTokens: entries.reduce((sum, entry) => sum + normalizeTokenCount(entry.promptTokens), 0),
    promptCacheHitTokens: entries.reduce((sum, entry) => sum + normalizeTokenCount(entry.promptCacheHitTokens), 0),
    promptCacheMissTokens: entries.reduce((sum, entry) => sum + normalizeTokenCount(entry.promptCacheMissTokens), 0),
    completionTokens: entries.reduce((sum, entry) => sum + normalizeTokenCount(entry.completionTokens), 0),
    totalTokens: entries.reduce((sum, entry) => sum + normalizeTokenCount(entry.totalTokens), 0),
    estimatedCostCny: normalizeNonNegativeMoney(entries.reduce((sum, entry) => sum + (entry.estimatedCostCny ?? 0), 0), 0),
    chargedAmountCny: normalizeNonNegativeMoney(entries.reduce((sum, entry) => sum + (entry.chargedAmountCny ?? 0), 0), 0),
    commissionAmountCny: normalizeNonNegativeMoney(entries.reduce((sum, entry) => sum + (entry.commissionAmountCny ?? 0), 0), 0),
    requestCount: entries.length,
  }
}

export function getBillingUsageRangeSync(input: {
  userId?: string | null
  from?: unknown
  to?: unknown
  limit?: unknown
} = {}): BillingUsageRangePayload | null {
  const userId = input.userId ?? getCurrentUserId()
  if (!userId) return null
  const from = parseRangeDate(input.from)
  const to = parseRangeDate(input.to)
  const fromMs = from ? Date.parse(from) : Date.now() - 30 * 24 * 60 * 60 * 1000
  const toMs = to ? Date.parse(to) : Date.now()
  const rawLimit = Number(input.limit)
  const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.floor(rawLimit))) : 100
  const entries = readBillingEntriesSync()
    .filter((entry) => entry.userId === userId && isUsageLedgerEntry(entry))
    .filter((entry) => {
      const createdAtMs = Date.parse(entry.createdAt)
      if (Number.isNaN(createdAtMs)) return false
      return createdAtMs >= fromMs && createdAtMs <= toMs
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return {
    summary: summarizeUsageRange(entries, from ?? new Date(fromMs).toISOString(), to ?? new Date(toMs).toISOString()),
    entries: entries.slice(0, limit),
  }
}

export async function getBillingUsageRange(input: {
  userId?: string | null
  from?: unknown
  to?: unknown
  limit?: unknown
} = {}): Promise<BillingUsageRangePayload | null> {
  return getBillingUsageRangeSync(input)
}

export async function adjustBillingBalance(input: {
  userId: string
  amountCny: number
  note?: string
  createdByUserId?: string | null
}): Promise<BillingUserSummary> {
  const userId = input.userId.trim()
  const amountCny = normalizeMoney(input.amountCny, Number.NaN)
  if (!userId) throw new Error("missing_user_id")
  if (!Number.isFinite(amountCny) || amountCny === 0) throw new Error("invalid_amount")

  return withBillingLock(async () => {
    const settings = readBillingSettingsSyncRaw()
    const entries = readBillingEntriesSync()
    const current = aggregateUserSummary(userId, entries, settings)
    const nextBalance = normalizeMoney(current.balanceCny + amountCny, 0)
    if (nextBalance < 0) throw new Error("insufficient_balance")

    await appendBillingEntry({
      id: crypto.randomUUID(),
      userId,
      type: amountCny > 0 ? "credit_adjustment" : "debit_adjustment",
      amountCny,
      balanceAfterCny: nextBalance,
      note: input.note?.trim() || undefined,
      createdByUserId: input.createdByUserId ?? getCurrentUserId(),
      createdAt: new Date().toISOString(),
    })

    return aggregateUserSummary(userId, readBillingEntriesSync(), settings)
  })
}

function buildUsageDetails(
  settings: BillingSettings,
  usage: TokenUsage,
  paymentSource: PaymentSource,
  balanceAfterCny: number | null,
): BillingUsageDetails {
  const promptTokens = normalizeTokenCount(usage.promptTokens)
  const promptCacheHitTokens = normalizeTokenCount(usage.promptCacheHitTokens)
  const promptCacheMissTokens = normalizeTokenCount(
    usage.promptCacheMissTokens ?? Math.max(0, promptTokens - promptCacheHitTokens),
  )
  const completionTokens = normalizeTokenCount(usage.completionTokens)
  const totalTokens = normalizeTokenCount(usage.totalTokens || promptTokens + completionTokens)
  const estimatedCostCny = estimateBillingCostCny(settings, {
    promptTokens,
    promptCacheHitTokens,
    promptCacheMissTokens,
    completionTokens,
    totalTokens,
  })
  const commissionAmountCny = paymentSource === "balance"
    ? normalizeNonNegativeMoney(estimatedCostCny * commissionRateForSettings(settings), 0)
    : 0
  const chargedAmountCny = paymentSource === "balance"
    ? normalizeNonNegativeMoney(estimatedCostCny + commissionAmountCny, 0)
    : 0

  return {
    paymentSource,
    promptTokens,
    promptCacheHitTokens,
    promptCacheMissTokens,
    completionTokens,
    totalTokens,
    estimatedCostCny,
    chargedAmountCny,
    commissionAmountCny,
    balanceAfterCny,
  }
}

export async function recordBillingUsage(input: {
  userId?: string | null
  provider: string
  model: string
  usage: TokenUsage
  feature: string
  paymentSource: PaymentSource
}): Promise<BillingLedgerEntry | null> {
  const userId = input.userId ?? getCurrentUserId()
  if (!userId) return null

  return withBillingLock(async () => {
    const settings = readBillingSettingsSyncRaw()
    const current = aggregateUserSummary(userId, readBillingEntriesSync(), settings)
    const provisional = buildUsageDetails(settings, input.usage, input.paymentSource, null)
    const balanceAfterCny = input.paymentSource === "balance"
      ? normalizeMoney(current.balanceCny - provisional.chargedAmountCny, 0)
      : current.balanceCny
    const usageDetails = { ...provisional, balanceAfterCny }
    const entry: BillingLedgerEntry = {
      id: crypto.randomUUID(),
      userId,
      type: input.paymentSource === "balance" ? "usage" : "usage_estimate",
      amountCny: input.paymentSource === "balance" ? -usageDetails.chargedAmountCny : 0,
      provider: input.provider,
      model: input.model,
      feature: input.feature,
      createdAt: new Date().toISOString(),
      ...usageDetails,
    }
    await appendBillingEntry(entry)
    return entry
  })
}
