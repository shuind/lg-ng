import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
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
  isAppModelId,
  isModelForProvider,
  normalizeAppPaymentSource,
  normalizeAppProviderId,
  normalizeAppModelId,
  type AppPaymentSource,
  type AppProviderId,
  type AppModelId,
  type AppSettings,
  type AppSettingsPayload,
  type UpdateAppSettingsInput,
} from "@/lib/app-settings"
import { getDataRoot } from "@/lib/server/paths"
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/server/secret-crypto"
import {
  canUseBalanceBillingSync,
  getPlatformBillingApiKey,
} from "@/lib/server/billing-store"

const APP_SETTINGS_FILE = "app-settings.json"
const DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z"

type ProviderSecretMap = Partial<Record<AppProviderId, string>>
type ProviderStringMap = Partial<Record<AppProviderId, string>>

type StoredAppSettings = AppSettings & {
  providerApiKeysEncrypted?: ProviderSecretMap
  providerKeyPreviews?: ProviderStringMap
  providerKeyUpdatedAts?: ProviderStringMap
  providerBaseUrls?: ProviderStringMap
  deepSeekApiKeyEncrypted?: string
  deepSeekKeyPreview?: string
}

export type EffectiveOpenAICompatibleConfig = OpenAICompatibleConfig & {
  paymentSource: AppPaymentSource
}

function appSettingsPath(): string {
  return path.join(getDataRoot(), APP_SETTINGS_FILE)
}

function normalizeProviderMap(data: unknown): ProviderStringMap | undefined {
  if (!data || typeof data !== "object") return undefined
  const output: ProviderStringMap = {}
  for (const option of APP_PROVIDER_OPTIONS) {
    const value = (data as Record<string, unknown>)[option.id]
    if (typeof value === "string" && value.trim()) output[option.id] = value
  }
  return Object.keys(output).length ? output : undefined
}

function normalizeSecretMap(data: unknown): ProviderSecretMap | undefined {
  return normalizeProviderMap(data) as ProviderSecretMap | undefined
}

function resolveProviderFromModel(value: unknown): AppProviderId {
  if (!isAppModelId(value)) return DEFAULT_APP_PROVIDER
  return APP_MODEL_OPTIONS.find((option) => option.id === value)?.provider ?? DEFAULT_APP_PROVIDER
}

function normalizeAppSettings(data: unknown): StoredAppSettings {
  const raw = data && typeof data === "object" ? data as Partial<StoredAppSettings> : {}
  const provider = isAppProviderId(raw.provider)
    ? raw.provider
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

  const fallbackPaymentSource = providerApiKeysEncrypted[provider] ? "api" : DEFAULT_PAYMENT_SOURCE
  const paymentSource = normalizePaymentForProvider(
    provider,
    normalizeAppPaymentSource(raw.paymentSource, fallbackPaymentSource),
  )

  return {
    provider,
    modelId: normalizeAppModelId(raw.modelId, provider),
    paymentSource,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_UPDATED_AT,
    providerApiKeysEncrypted,
    providerKeyPreviews,
    providerKeyUpdatedAts,
    providerBaseUrls,
    providerKeyUpdatedAt: providerKeyUpdatedAts[provider],
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

function modelEnvForProvider(provider: AppProviderId): string | undefined {
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL
  if (provider === "mimo") return process.env.MIMO_MODEL
  if (provider === "claude-relay") return process.env.CLAUDE_RELAY_MODEL ?? process.env.CLAUDE_MODEL
  return undefined
}

function baseUrlEnvForProvider(provider: AppProviderId): string | undefined {
  if (provider === "deepseek") return process.env.DEEPSEEK_BASE_URL
  if (provider === "mimo") return process.env.MIMO_BASE_URL
  if (provider === "claude-relay") return process.env.CLAUDE_RELAY_BASE_URL ?? process.env.CLAUDE_BASE_URL
  return undefined
}

function apiKeyEnvForProvider(provider: AppProviderId): string | undefined {
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY
  if (provider === "mimo") return process.env.MIMO_API_KEY
  if (provider === "claude-relay") return process.env.CLAUDE_RELAY_API_KEY ?? process.env.CLAUDE_API_KEY
  return undefined
}

function getDefaultBaseUrl(provider: AppProviderId): string {
  return baseUrlEnvForProvider(provider) ?? getAppProviderOption(provider).defaultBaseUrl
}

function normalizePaymentForProvider(provider: AppProviderId, paymentSource: AppPaymentSource): AppPaymentSource {
  return getAppProviderOption(provider).supportsBalance ? paymentSource : "api"
}

function getProviderConfigForSettings(settings: StoredAppSettings): OpenAICompatibleConfig | null {
  const encrypted = settings.providerApiKeysEncrypted?.[settings.provider]
  const envApiKey = apiKeyEnvForProvider(settings.provider)
  const apiKey = encrypted ? decryptSecret(encrypted) : envApiKey
  const baseUrl = settings.providerBaseUrls?.[settings.provider] ?? getDefaultBaseUrl(settings.provider)
  if (!apiKey || !baseUrl) return null
  return {
    provider: settings.provider,
    apiKey,
    baseUrl,
    model: settings.modelId,
  }
}

function getPlatformProviderConfig(settings: StoredAppSettings): EffectiveOpenAICompatibleConfig | null {
  if (settings.provider !== "deepseek") return null
  const apiKey = getPlatformBillingApiKey()
  if (!apiKey || !canUseBalanceBillingSync()) return null
  return {
    provider: "deepseek",
    paymentSource: "balance",
    apiKey,
    baseUrl: getDefaultBaseUrl("deepseek"),
    model: settings.modelId,
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
  return getPlatformProviderConfig(settings) ?? withUserPaymentSource(userConfig)
}

function createDefaultSettings(): StoredAppSettings {
  const provider = defaultProviderFromEnv()
  return {
    provider,
    modelId: defaultModelIdFromEnv(provider),
    paymentSource: normalizePaymentForProvider(provider, DEFAULT_PAYMENT_SOURCE),
    updatedAt: DEFAULT_UPDATED_AT,
  }
}

function buildPayload(saved: StoredAppSettings | null): AppSettingsPayload {
  const settings = saved ?? createDefaultSettings()
  const userConfig = getProviderConfigForSettings(settings)
  const activeConfig = resolveEffectiveConfig(settings, userConfig)
  const providerKeyPreview = settings.providerKeyPreviews?.[settings.provider] ?? null
  const providerKeyUpdatedAt = settings.providerKeyUpdatedAts?.[settings.provider]

  return {
    provider: settings.provider,
    modelId: settings.modelId,
    paymentSource: settings.paymentSource,
    updatedAt: settings.updatedAt,
    providerKeyUpdatedAt,
    deepSeekKeyUpdatedAt: settings.providerKeyUpdatedAts?.deepseek,
    saved: Boolean(saved),
    activeProvider: activeConfig?.provider ?? "none",
    activeModel: activeConfig?.model ?? null,
    providerConfigured: Boolean(settings.providerApiKeysEncrypted?.[settings.provider] ?? apiKeyEnvForProvider(settings.provider)),
    providerKeyPreview,
    providerBaseUrl: settings.providerBaseUrls?.[settings.provider] ?? getDefaultBaseUrl(settings.provider) ?? null,
    providerOptions: APP_PROVIDER_OPTIONS,
    modelOptions: APP_MODEL_OPTIONS,
    deepSeekConfigured: Boolean(settings.providerApiKeysEncrypted?.deepseek ?? process.env.DEEPSEEK_API_KEY),
    deepSeekKeyPreview: settings.providerKeyPreviews?.deepseek ?? null,
  }
}

export async function getAppSettings(): Promise<AppSettingsPayload> {
  return buildPayload(await readSavedAppSettings())
}

export async function saveAppSettings(input: UpdateAppSettingsInput): Promise<AppSettingsPayload> {
  const existing = await readSavedAppSettings()
  const current = existing ?? createDefaultSettings()
  const nextProvider = input.provider === undefined
    ? current.provider
    : normalizeAppProviderId(input.provider)
  if (input.provider !== undefined && !isAppProviderId(input.provider)) {
    throw new Error("unsupported provider")
  }

  const rawModelId = input.modelId ?? (current.provider === nextProvider ? current.modelId : getDefaultModelForProvider(nextProvider))
  if (!isAppModelId(rawModelId) || !isModelForProvider(rawModelId, nextProvider)) {
    throw new Error("unsupported model")
  }

  const incomingProviderApiKey = typeof input.providerApiKey === "string" ? input.providerApiKey.trim() : ""
  const incomingDeepSeekApiKey = typeof input.deepSeekApiKey === "string" ? input.deepSeekApiKey.trim() : ""
  const incomingApiKey = incomingProviderApiKey || incomingDeepSeekApiKey
  const providerApiKeysEncrypted = { ...(current.providerApiKeysEncrypted ?? {}) }
  const providerKeyPreviews = { ...(current.providerKeyPreviews ?? {}) }
  const providerKeyUpdatedAts = { ...(current.providerKeyUpdatedAts ?? {}) }
  const providerBaseUrls = { ...(current.providerBaseUrls ?? {}) }

  const requestedPaymentSource = input.paymentSource ?? (incomingApiKey ? "api" : current.paymentSource)
  if (!isAppPaymentSource(requestedPaymentSource)) {
    throw new Error("unsupported payment source")
  }

  const settings: StoredAppSettings = {
    ...current,
    provider: nextProvider,
    modelId: rawModelId,
    paymentSource: normalizePaymentForProvider(nextProvider, requestedPaymentSource),
    providerApiKeysEncrypted,
    providerKeyPreviews,
    providerKeyUpdatedAts,
    providerBaseUrls,
    updatedAt: new Date().toISOString(),
  }

  if (input.clearProviderApiKey === true || (nextProvider === "deepseek" && input.clearDeepSeekApiKey === true)) {
    delete providerApiKeysEncrypted[nextProvider]
    delete providerKeyPreviews[nextProvider]
    delete providerKeyUpdatedAts[nextProvider]
  }

  if (incomingApiKey) {
    providerApiKeysEncrypted[nextProvider] = encryptSecret(incomingApiKey)
    providerKeyPreviews[nextProvider] = maskSecret(incomingApiKey)
    providerKeyUpdatedAts[nextProvider] = settings.updatedAt
    settings.paymentSource = "api"
  }

  if (typeof input.providerBaseUrl === "string") {
    const trimmedBaseUrl = input.providerBaseUrl.trim()
    if (trimmedBaseUrl) {
      providerBaseUrls[nextProvider] = trimmedBaseUrl
    } else {
      delete providerBaseUrls[nextProvider]
    }
  }

  settings.providerKeyUpdatedAt = providerKeyUpdatedAts[nextProvider]
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
