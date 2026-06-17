import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import {
  createChatCompletion,
  createOpenAICompatibleClient,
  type OpenAICompatibleConfig,
} from "novel-guide"
import {
  APP_MODEL_OPTIONS,
  APP_PROVIDER_OPTIONS,
  DEFAULT_APP_MODEL_ID,
  DEFAULT_APP_PROVIDER,
  DEFAULT_PAYMENT_SOURCE,
  getAppProviderOption,
  getDefaultModelForProvider,
  isAppPaymentSource,
  isAppProviderId,
  isBuiltinAppProviderId,
  isAppModelId,
  isModelForProvider,
  normalizeAppPaymentSource,
  normalizeAppProviderId,
  normalizeAppModelId,
  type AppPaymentSource,
  type AppProviderId,
  type AppModelId,
  type AppProviderOption,
  type AppModelOption,
  type AppCustomProvider,
  type AppSettingsPayload,
  type UpdateAppSettingsInput,
} from "@/lib/app-settings"
import { getDataRoot } from "@/lib/server/paths"
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/server/secret-crypto"
import {
  canUseBalanceBillingSync,
  getPlatformBillingConfig,
} from "@/lib/server/billing-store"

const APP_SETTINGS_FILE = "app-settings.json"
const DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z"

type ProviderSecretMap = Record<string, string>
type ProviderStringMap = Record<string, string>

type StoredCustomProvider = {
  id: AppProviderId
  label: string
  baseUrl: string
  modelId: AppModelId
  apiKeyEncrypted?: string
  keyPreview?: string
  keyUpdatedAt?: string
  createdAt: string
  updatedAt: string
}

type StoredAppSettings = {
  provider: AppProviderId
  modelId: AppModelId
  paymentSource: AppPaymentSource
  updatedAt: string
  providerKeyUpdatedAt?: string
  deepSeekKeyUpdatedAt?: string
  providerApiKeysEncrypted?: ProviderSecretMap
  providerKeyPreviews?: ProviderStringMap
  providerKeyUpdatedAts?: ProviderStringMap
  providerBaseUrls?: ProviderStringMap
  customProviders: StoredCustomProvider[]
  deepSeekApiKeyEncrypted?: string
  deepSeekKeyPreview?: string
}

export type EffectiveOpenAICompatibleConfig = OpenAICompatibleConfig & {
  paymentSource: AppPaymentSource
}

function appSettingsPath(): string {
  return path.join(getDataRoot(), APP_SETTINGS_FILE)
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeProviderMap(data: unknown): ProviderStringMap | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined
  const output: ProviderStringMap = {}
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.trim()
    const normalizedValue = stringOrEmpty(value)
    if (normalizedKey && normalizedValue) output[normalizedKey] = normalizedValue
  }
  return Object.keys(output).length ? output : undefined
}

function normalizeSecretMap(data: unknown): ProviderSecretMap | undefined {
  return normalizeProviderMap(data) as ProviderSecretMap | undefined
}

function createCustomProviderId(): string {
  return `custom-${randomUUID()}`
}

function normalizeCustomProvider(data: unknown, fallbackUpdatedAt = DEFAULT_UPDATED_AT): StoredCustomProvider | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const raw = data as Partial<StoredCustomProvider>
  const id = normalizeAppProviderId(raw.id)
  const label = stringOrEmpty(raw.label)
  const baseUrl = stringOrEmpty(raw.baseUrl)
  const modelId = stringOrEmpty(raw.modelId)
  if (!id || isBuiltinAppProviderId(id) || !label || !baseUrl || !modelId) return null
  return {
    id,
    label,
    baseUrl,
    modelId,
    apiKeyEncrypted: typeof raw.apiKeyEncrypted === "string" && raw.apiKeyEncrypted ? raw.apiKeyEncrypted : undefined,
    keyPreview: typeof raw.keyPreview === "string" && raw.keyPreview ? raw.keyPreview : undefined,
    keyUpdatedAt: typeof raw.keyUpdatedAt === "string" ? raw.keyUpdatedAt : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallbackUpdatedAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallbackUpdatedAt,
  }
}

function normalizeCustomProviders(data: unknown, fallbackUpdatedAt = DEFAULT_UPDATED_AT): StoredCustomProvider[] {
  if (!Array.isArray(data)) return []
  const byId = new Map<string, StoredCustomProvider>()
  for (const item of data) {
    const provider = normalizeCustomProvider(item, fallbackUpdatedAt)
    if (provider) byId.set(provider.id, provider)
  }
  return [...byId.values()]
}

function publicCustomProvider(provider: StoredCustomProvider): AppCustomProvider {
  return {
    id: provider.id,
    label: provider.label,
    baseUrl: provider.baseUrl,
    modelId: provider.modelId,
    configured: Boolean(provider.apiKeyEncrypted),
    keyPreview: provider.keyPreview ?? null,
    keyUpdatedAt: provider.keyUpdatedAt,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  }
}

function publicCustomProviders(providers: StoredCustomProvider[]): AppCustomProvider[] {
  return providers.map(publicCustomProvider)
}

function customProviderOptions(providers: StoredCustomProvider[]): AppProviderOption[] {
  return providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    description: "自定义 OpenAI 兼容接口。",
    defaultBaseUrl: provider.baseUrl,
    supportsBalance: false,
    apiKeyPlaceholder: "sk-...",
    custom: true,
  }))
}

function customModelOptions(providers: StoredCustomProvider[]): AppModelOption[] {
  return providers.map((provider) => ({
    id: provider.modelId,
    label: provider.modelId,
    provider: provider.id,
    description: "自定义模型 ID。",
    custom: true,
  }))
}

function findCustomProvider(settings: StoredAppSettings, providerId: AppProviderId): StoredCustomProvider | undefined {
  return settings.customProviders.find((provider) => provider.id === providerId)
}

function resolveProviderFromModel(value: unknown): AppProviderId {
  if (!isAppModelId(value)) return DEFAULT_APP_PROVIDER
  return APP_MODEL_OPTIONS.find((option) => option.id === value)?.provider ?? DEFAULT_APP_PROVIDER
}

function normalizeAppSettings(data: unknown): StoredAppSettings {
  const raw = data && typeof data === "object" ? data as Partial<StoredAppSettings> : {}
  const customProviders = normalizeCustomProviders(raw.customProviders, typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_UPDATED_AT)
  const provider = isAppProviderId(raw.provider)
    ? normalizeAppProviderId(raw.provider)
    : resolveProviderFromModel(raw.modelId)
  const providerApiKeysEncrypted = normalizeSecretMap(raw.providerApiKeysEncrypted) ?? {}
  const providerKeyPreviews = normalizeProviderMap(raw.providerKeyPreviews) ?? {}
  const providerKeyUpdatedAts = normalizeProviderMap(raw.providerKeyUpdatedAts) ?? {}
  const providerBaseUrls = normalizeProviderMap(raw.providerBaseUrls) ?? {}

  if (typeof raw.deepSeekApiKeyEncrypted === "string" && !providerApiKeysEncrypted.deepseek) {
    providerApiKeysEncrypted.deepseek = raw.deepSeekApiKeyEncrypted
  }
  if (typeof raw.deepSeekKeyPreview === "string" && !providerKeyPreviews.deepseek) {
    providerKeyPreviews.deepseek = raw.deepSeekKeyPreview
  }
  if (typeof raw.deepSeekKeyUpdatedAt === "string" && !providerKeyUpdatedAts.deepseek) {
    providerKeyUpdatedAts.deepseek = raw.deepSeekKeyUpdatedAt
  }

  const providerExists = isBuiltinAppProviderId(provider) || customProviders.some((item) => item.id === provider)
  const normalizedProvider = providerExists ? provider : DEFAULT_APP_PROVIDER
  const customProvider = customProviders.find((item) => item.id === normalizedProvider)
  const fallbackPaymentSource = providerApiKeysEncrypted[normalizedProvider] || customProvider?.apiKeyEncrypted
    ? "api"
    : DEFAULT_PAYMENT_SOURCE
  const paymentSource = normalizePaymentForProvider(
    normalizeAppPaymentSource(raw.paymentSource, fallbackPaymentSource),
  )

  return {
    provider: normalizedProvider,
    modelId: normalizeAppModelId(raw.modelId, normalizedProvider, publicCustomProviders(customProviders)),
    paymentSource,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_UPDATED_AT,
    providerApiKeysEncrypted,
    providerKeyPreviews,
    providerKeyUpdatedAts,
    providerBaseUrls,
    customProviders,
    providerKeyUpdatedAt: providerKeyUpdatedAts[normalizedProvider],
    deepSeekApiKeyEncrypted: providerApiKeysEncrypted.deepseek,
    deepSeekKeyPreview: providerKeyPreviews.deepseek,
    deepSeekKeyUpdatedAt: providerKeyUpdatedAts.deepseek,
  }
}

async function readSavedAppSettings(): Promise<StoredAppSettings | null> {
  try {
    const raw = await fsp.readFile(appSettingsPath(), "utf8")
    return normalizeAppSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

function readSavedAppSettingsSync(): StoredAppSettings | null {
  try {
    const raw = fs.readFileSync(appSettingsPath(), "utf8")
    return normalizeAppSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

function defaultProviderFromEnv(): AppProviderId {
  return normalizeAppProviderId(process.env.NG_PROVIDER ?? process.env.LLM_PROVIDER ?? DEFAULT_APP_PROVIDER)
}

function defaultModelIdFromEnv(provider = defaultProviderFromEnv()): AppModelId {
  const rawModel = process.env.NG_MODEL ?? modelEnvForProvider(provider) ?? DEFAULT_APP_MODEL_ID
  return normalizeAppModelId(rawModel, provider)
}

function genericEnvMatches(provider: AppProviderId): boolean {
  const genericProvider = stringOrEmpty(process.env.NG_PROVIDER ?? process.env.LLM_PROVIDER).toLowerCase()
  return !genericProvider || genericProvider === provider.toLowerCase()
}

function modelEnvForProvider(provider: AppProviderId): string | undefined {
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL
  if (provider === "mimo") return process.env.MIMO_MODEL
  if (provider === "claude-relay") return process.env.CLAUDE_RELAY_MODEL ?? process.env.CLAUDE_MODEL
  return genericEnvMatches(provider) ? process.env.NG_MODEL : undefined
}

function baseUrlEnvForProvider(provider: AppProviderId): string | undefined {
  if (provider === "deepseek") return process.env.DEEPSEEK_BASE_URL
  if (provider === "mimo") return process.env.MIMO_BASE_URL
  if (provider === "claude-relay") return process.env.CLAUDE_RELAY_BASE_URL ?? process.env.CLAUDE_BASE_URL
  return genericEnvMatches(provider) ? process.env.NG_BASE_URL : undefined
}

function apiKeyEnvForProvider(provider: AppProviderId): string | undefined {
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY
  if (provider === "mimo") return process.env.MIMO_API_KEY
  if (provider === "claude-relay") return process.env.CLAUDE_RELAY_API_KEY ?? process.env.CLAUDE_API_KEY
  return genericEnvMatches(provider) ? process.env.NG_API_KEY : undefined
}

function getDefaultBaseUrl(provider: AppProviderId): string {
  return baseUrlEnvForProvider(provider) ?? getAppProviderOption(provider).defaultBaseUrl
}

function normalizePaymentForProvider(paymentSource: AppPaymentSource): AppPaymentSource {
  return paymentSource
}

function getProviderConfigForSettings(settings: StoredAppSettings): OpenAICompatibleConfig | null {
  const custom = findCustomProvider(settings, settings.provider)
  if (custom) {
    if (!custom.apiKeyEncrypted || !custom.baseUrl || !custom.modelId) return null
    return {
      provider: custom.id,
      apiKey: decryptSecret(custom.apiKeyEncrypted),
      baseUrl: custom.baseUrl,
      model: custom.modelId,
    }
  }

  const encrypted = settings.providerApiKeysEncrypted?.[settings.provider]
  const envApiKey = apiKeyEnvForProvider(settings.provider)
  const apiKey = encrypted ? decryptSecret(encrypted) : envApiKey
  const baseUrl = settings.providerBaseUrls?.[settings.provider] ?? getDefaultBaseUrl(settings.provider)
  if (!apiKey || !baseUrl || !settings.modelId) return null
  return {
    provider: settings.provider,
    apiKey,
    baseUrl,
    model: settings.modelId,
  }
}

function getPlatformProviderConfig(): EffectiveOpenAICompatibleConfig | null {
  const platformConfig = getPlatformBillingConfig()
  if (!platformConfig || !canUseBalanceBillingSync()) return null
  return {
    provider: platformConfig.provider,
    paymentSource: "balance",
    apiKey: platformConfig.apiKey,
    baseUrl: platformConfig.baseUrl,
    model: platformConfig.model,
  }
}

function withUserPaymentSource(config: OpenAICompatibleConfig | null): EffectiveOpenAICompatibleConfig | null {
  return config ? { ...config, paymentSource: "api" } : null
}

function resolveEffectiveConfig(
  settings: StoredAppSettings,
  userConfig: OpenAICompatibleConfig | null,
): EffectiveOpenAICompatibleConfig | null {
  if (settings.paymentSource === "api") return withUserPaymentSource(userConfig)
  return getPlatformProviderConfig() ?? withUserPaymentSource(userConfig)
}

function createDefaultSettings(): StoredAppSettings {
  const provider = defaultProviderFromEnv()
  const providerBaseUrls: ProviderStringMap = {}
  const genericBaseUrl = provider !== DEFAULT_APP_PROVIDER ? process.env.NG_BASE_URL : undefined
  if (genericBaseUrl) providerBaseUrls[provider] = genericBaseUrl
  return {
    provider,
    modelId: defaultModelIdFromEnv(provider),
    paymentSource: normalizePaymentForProvider(DEFAULT_PAYMENT_SOURCE),
    updatedAt: DEFAULT_UPDATED_AT,
    providerApiKeysEncrypted: {},
    providerKeyPreviews: {},
    providerKeyUpdatedAts: {},
    providerBaseUrls,
    customProviders: [],
  }
}

function buildPayload(saved: StoredAppSettings | null): AppSettingsPayload {
  const settings = saved ?? createDefaultSettings()
  const publicCustom = publicCustomProviders(settings.customProviders)
  const userConfig = getProviderConfigForSettings(settings)
  const activeConfig = resolveEffectiveConfig(settings, userConfig)
  const platformConfig = getPlatformBillingConfig()
  const custom = findCustomProvider(settings, settings.provider)
  const providerKeyPreview = custom?.keyPreview ?? settings.providerKeyPreviews?.[settings.provider] ?? null
  const providerKeyUpdatedAt = custom?.keyUpdatedAt ?? settings.providerKeyUpdatedAts?.[settings.provider]
  const providerBaseUrl = custom?.baseUrl ?? settings.providerBaseUrls?.[settings.provider] ?? getDefaultBaseUrl(settings.provider) ?? null

  return {
    provider: settings.provider,
    modelId: custom?.modelId ?? settings.modelId,
    paymentSource: settings.paymentSource,
    updatedAt: settings.updatedAt,
    providerKeyUpdatedAt,
    deepSeekKeyUpdatedAt: settings.providerKeyUpdatedAts?.deepseek,
    customProviders: publicCustom,
    saved: Boolean(saved),
    activeProvider: activeConfig?.provider ?? "none",
    activeModel: activeConfig?.model ?? null,
    platformProvider: platformConfig?.provider ?? null,
    platformModel: platformConfig?.model ?? null,
    providerConfigured: Boolean(custom?.apiKeyEncrypted ?? settings.providerApiKeysEncrypted?.[settings.provider] ?? apiKeyEnvForProvider(settings.provider)),
    providerKeyPreview,
    providerBaseUrl,
    providerOptions: [...APP_PROVIDER_OPTIONS, ...customProviderOptions(settings.customProviders)],
    modelOptions: [...APP_MODEL_OPTIONS, ...customModelOptions(settings.customProviders)],
    deepSeekConfigured: Boolean(settings.providerApiKeysEncrypted?.deepseek ?? process.env.DEEPSEEK_API_KEY),
    deepSeekKeyPreview: settings.providerKeyPreviews?.deepseek ?? null,
  }
}

export async function getAppSettings(): Promise<AppSettingsPayload> {
  return buildPayload(await readSavedAppSettings())
}

function ensureProviderExists(provider: AppProviderId, settings: StoredAppSettings): void {
  if (isBuiltinAppProviderId(provider)) return
  if (findCustomProvider(settings, provider)) return
  throw new Error("unsupported provider")
}

function validateModelForProvider(modelId: AppModelId, provider: AppProviderId, settings: StoredAppSettings): void {
  const custom = findCustomProvider(settings, provider)
  if (custom) {
    if (!modelId.trim()) throw new Error("unsupported model")
    return
  }
  if (!isAppModelId(modelId) || !isModelForProvider(modelId, provider)) {
    throw new Error("unsupported model")
  }
}

function upsertCustomProvider(current: StoredAppSettings, input: UpdateAppSettingsInput): {
  settings: StoredAppSettings
  providerId: AppProviderId | null
} {
  const hasCustomInput = input.customProviderId !== undefined ||
    input.customProviderLabel !== undefined ||
    input.customProviderBaseUrl !== undefined ||
    input.customProviderModelId !== undefined ||
    input.customProviderApiKey !== undefined
  if (!hasCustomInput) return { settings: current, providerId: null }

  const now = new Date().toISOString()
  const requestedId = stringOrEmpty(input.customProviderId)
  const existing = requestedId ? current.customProviders.find((provider) => provider.id === requestedId) : undefined
  const id = existing?.id ?? (requestedId || createCustomProviderId())
  if (isBuiltinAppProviderId(id)) throw new Error("unsupported provider")

  const label = stringOrEmpty(input.customProviderLabel) || existing?.label || "自定义模型"
  const baseUrl = stringOrEmpty(input.customProviderBaseUrl) || existing?.baseUrl || ""
  const modelId = stringOrEmpty(input.customProviderModelId) || existing?.modelId || ""
  if (!label || !baseUrl || !modelId) throw new Error("invalid custom provider")

  const incomingApiKey = stringOrEmpty(input.customProviderApiKey)
  if (!existing && !incomingApiKey) throw new Error("invalid custom provider")
  const nextProvider: StoredCustomProvider = {
    id,
    label,
    baseUrl,
    modelId,
    apiKeyEncrypted: incomingApiKey ? encryptSecret(incomingApiKey) : existing?.apiKeyEncrypted,
    keyPreview: incomingApiKey ? maskSecret(incomingApiKey) : existing?.keyPreview,
    keyUpdatedAt: incomingApiKey ? now : existing?.keyUpdatedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const nextProviders = current.customProviders.filter((provider) => provider.id !== id)
  nextProviders.push(nextProvider)

  return {
    settings: {
      ...current,
      customProviders: nextProviders,
      provider: id,
      modelId,
      updatedAt: now,
    },
    providerId: id,
  }
}

function deleteCustomProvider(current: StoredAppSettings, deleteCustomProviderId: unknown): StoredAppSettings {
  const id = stringOrEmpty(deleteCustomProviderId)
  if (!id) return current
  const nextProviders = current.customProviders.filter((provider) => provider.id !== id)
  const deletingActive = current.provider === id
  return {
    ...current,
    customProviders: nextProviders,
    provider: deletingActive ? DEFAULT_APP_PROVIDER : current.provider,
    modelId: deletingActive ? DEFAULT_APP_MODEL_ID : current.modelId,
    paymentSource: deletingActive ? DEFAULT_PAYMENT_SOURCE : current.paymentSource,
    updatedAt: new Date().toISOString(),
  }
}

export async function saveAppSettings(input: UpdateAppSettingsInput): Promise<AppSettingsPayload> {
  const existing = await readSavedAppSettings()
  let current = existing ?? createDefaultSettings()

  current = deleteCustomProvider(current, input.deleteCustomProviderId)
  current = upsertCustomProvider(current, input).settings

  const nextProvider = input.provider === undefined
    ? current.provider
    : normalizeAppProviderId(input.provider)
  if (input.provider !== undefined) ensureProviderExists(nextProvider, current)

  const publicCustom = publicCustomProviders(current.customProviders)
  const rawModelId = input.modelId ?? (current.provider === nextProvider ? current.modelId : getDefaultModelForProvider(nextProvider, publicCustom))
  if (!isAppModelId(rawModelId)) throw new Error("unsupported model")
  const nextModelId = normalizeAppModelId(rawModelId, nextProvider, publicCustom)
  validateModelForProvider(nextModelId, nextProvider, current)

  const incomingProviderApiKey = stringOrEmpty(input.providerApiKey)
  const incomingDeepSeekApiKey = stringOrEmpty(input.deepSeekApiKey)
  const incomingApiKey = incomingProviderApiKey || incomingDeepSeekApiKey
  const providerApiKeysEncrypted = { ...(current.providerApiKeysEncrypted ?? {}) }
  const providerKeyPreviews = { ...(current.providerKeyPreviews ?? {}) }
  const providerKeyUpdatedAts = { ...(current.providerKeyUpdatedAts ?? {}) }
  const providerBaseUrls = { ...(current.providerBaseUrls ?? {}) }

  const requestedPaymentSource = input.paymentSource ?? current.paymentSource
  if (!isAppPaymentSource(requestedPaymentSource)) {
    throw new Error("unsupported payment source")
  }

  const now = new Date().toISOString()
  const settings: StoredAppSettings = {
    ...current,
    provider: nextProvider,
    modelId: nextModelId,
    paymentSource: normalizePaymentForProvider(requestedPaymentSource),
    providerApiKeysEncrypted,
    providerKeyPreviews,
    providerKeyUpdatedAts,
    providerBaseUrls,
    updatedAt: now,
  }

  const custom = findCustomProvider(settings, nextProvider)
  if (custom) {
    custom.modelId = nextModelId
    custom.updatedAt = now
    if (typeof input.providerBaseUrl === "string") {
      const trimmedBaseUrl = input.providerBaseUrl.trim()
      if (!trimmedBaseUrl) throw new Error("invalid custom provider")
      custom.baseUrl = trimmedBaseUrl
    }
    if (input.clearProviderApiKey === true) {
      delete custom.apiKeyEncrypted
      delete custom.keyPreview
      delete custom.keyUpdatedAt
    }
    if (incomingProviderApiKey) {
      custom.apiKeyEncrypted = encryptSecret(incomingProviderApiKey)
      custom.keyPreview = maskSecret(incomingProviderApiKey)
      custom.keyUpdatedAt = now
    }
  } else {
    if (input.clearProviderApiKey === true || (nextProvider === "deepseek" && input.clearDeepSeekApiKey === true)) {
      delete providerApiKeysEncrypted[nextProvider]
      delete providerKeyPreviews[nextProvider]
      delete providerKeyUpdatedAts[nextProvider]
    }

    if (incomingApiKey) {
      providerApiKeysEncrypted[nextProvider] = encryptSecret(incomingApiKey)
      providerKeyPreviews[nextProvider] = maskSecret(incomingApiKey)
      providerKeyUpdatedAts[nextProvider] = now
    }

    if (typeof input.providerBaseUrl === "string") {
      const trimmedBaseUrl = input.providerBaseUrl.trim()
      if (trimmedBaseUrl) {
        providerBaseUrls[nextProvider] = trimmedBaseUrl
      } else {
        delete providerBaseUrls[nextProvider]
      }
    }
  }

  settings.providerKeyUpdatedAt = custom?.keyUpdatedAt ?? providerKeyUpdatedAts[nextProvider]
  settings.deepSeekApiKeyEncrypted = providerApiKeysEncrypted.deepseek
  settings.deepSeekKeyPreview = providerKeyPreviews.deepseek
  settings.deepSeekKeyUpdatedAt = providerKeyUpdatedAts.deepseek

  await fsp.mkdir(getDataRoot(), { recursive: true })
  await fsp.writeFile(appSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  return buildPayload(settings)
}

export function getEffectiveOpenAICompatibleConfig(): EffectiveOpenAICompatibleConfig | null {
  const saved = readSavedAppSettingsSync()
  const settings = saved ?? createDefaultSettings()
  const userConfig = getProviderConfigForSettings(settings)
  return resolveEffectiveConfig(settings, userConfig)
}

export async function testAppSettingsLlm(): Promise<{ ok: true; model: string; provider: AppProviderId }> {
  const saved = await readSavedAppSettings()
  const settings = saved ?? createDefaultSettings()
  const config = getProviderConfigForSettings(settings)
  if (!config) throw new Error("provider api key missing")

  await createChatCompletion({
    client: createOpenAICompatibleClient(config),
    model: config.model,
    messages: [
      { role: "user", content: "Reply with OK only." },
    ],
    temperature: 0,
    maxTokens: 8,
    timeoutMs: 20000,
  })
  return { ok: true, model: config.model, provider: settings.provider }
}
