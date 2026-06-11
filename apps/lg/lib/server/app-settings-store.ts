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
  DEFAULT_APP_MODEL_ID,
  isAppModelId,
  normalizeAppModelId,
  type AppModelId,
  type AppSettings,
  type AppSettingsPayload,
  type UpdateAppSettingsInput,
} from "@/lib/app-settings"
import { getDataRoot } from "@/lib/server/paths"
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/server/secret-crypto"
import {
  canUsePlatformTrialQuotaSync,
  getPlatformDeepSeekApiKey,
} from "@/lib/server/trial-quota-store"

const APP_SETTINGS_FILE = "app-settings.json"
const DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z"

type StoredAppSettings = AppSettings & {
  deepSeekApiKeyEncrypted?: string
  deepSeekKeyPreview?: string
}

export type EffectiveOpenAICompatibleConfig = OpenAICompatibleConfig & {
  quotaSource: "user" | "platform"
}

function appSettingsPath(): string {
  return path.join(getDataRoot(), APP_SETTINGS_FILE)
}

function normalizeAppSettings(data: unknown): StoredAppSettings {
  const raw = data && typeof data === "object" ? data as Partial<StoredAppSettings> : {}
  return {
    modelId: normalizeAppModelId(raw.modelId),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_UPDATED_AT,
    deepSeekApiKeyEncrypted: typeof raw.deepSeekApiKeyEncrypted === "string"
      ? raw.deepSeekApiKeyEncrypted
      : undefined,
    deepSeekKeyPreview: typeof raw.deepSeekKeyPreview === "string" ? raw.deepSeekKeyPreview : undefined,
    deepSeekKeyUpdatedAt: typeof raw.deepSeekKeyUpdatedAt === "string" ? raw.deepSeekKeyUpdatedAt : undefined,
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

function defaultModelIdFromEnv(): AppModelId {
  return normalizeAppModelId(process.env.NG_MODEL ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_APP_MODEL_ID)
}

function getDeepSeekConfigForSettings(settings: StoredAppSettings): OpenAICompatibleConfig | null {
  if (!settings.deepSeekApiKeyEncrypted) return null
  return {
    provider: "deepseek",
    apiKey: decryptSecret(settings.deepSeekApiKeyEncrypted),
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: settings.modelId,
  }
}

function getPlatformDeepSeekConfig(modelId: AppModelId): EffectiveOpenAICompatibleConfig | null {
  const apiKey = getPlatformDeepSeekApiKey()
  if (!apiKey || !canUsePlatformTrialQuotaSync()) return null
  return {
    provider: "deepseek",
    quotaSource: "platform",
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: modelId,
  }
}

function buildPayload(saved: StoredAppSettings | null): AppSettingsPayload {
  const settings = saved ?? {
    modelId: defaultModelIdFromEnv(),
    updatedAt: DEFAULT_UPDATED_AT,
  }
  const activeConfig = saved ? getDeepSeekConfigForSettings(settings) : null

  return {
    modelId: settings.modelId,
    updatedAt: settings.updatedAt,
    deepSeekKeyUpdatedAt: settings.deepSeekKeyUpdatedAt,
    saved: Boolean(saved),
    activeProvider: activeConfig ? "deepseek" : "none",
    activeModel: activeConfig?.model ?? null,
    deepSeekConfigured: Boolean(saved?.deepSeekApiKeyEncrypted),
    deepSeekKeyPreview: saved?.deepSeekKeyPreview ?? null,
    modelOptions: APP_MODEL_OPTIONS,
  }
}

export async function getAppSettings(): Promise<AppSettingsPayload> {
  return buildPayload(await readSavedAppSettings())
}

export async function saveAppSettings(input: UpdateAppSettingsInput): Promise<AppSettingsPayload> {
  const existing = await readSavedAppSettings()
  const nextModelId = input.modelId ?? existing?.modelId ?? defaultModelIdFromEnv()
  if (!isAppModelId(nextModelId)) {
    throw new Error("unsupported model")
  }

  const settings: StoredAppSettings = {
    ...existing,
    modelId: nextModelId,
    updatedAt: new Date().toISOString(),
  }

  if (input.clearDeepSeekApiKey === true) {
    delete settings.deepSeekApiKeyEncrypted
    delete settings.deepSeekKeyPreview
    delete settings.deepSeekKeyUpdatedAt
  }

  if (typeof input.deepSeekApiKey === "string") {
    const apiKey = input.deepSeekApiKey.trim()
    if (apiKey) {
      settings.deepSeekApiKeyEncrypted = encryptSecret(apiKey)
      settings.deepSeekKeyPreview = maskSecret(apiKey)
      settings.deepSeekKeyUpdatedAt = settings.updatedAt
    }
  }

  await fsp.mkdir(getDataRoot(), { recursive: true })
  await fsp.writeFile(appSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  return buildPayload(settings)
}

export function getEffectiveOpenAICompatibleConfig(): EffectiveOpenAICompatibleConfig | null {
  const saved = readSavedAppSettingsSync()
  const userConfig = saved ? getDeepSeekConfigForSettings(saved) : null
  if (userConfig) return { ...userConfig, quotaSource: "user" }
  return getPlatformDeepSeekConfig(saved?.modelId ?? defaultModelIdFromEnv())
}

export async function testAppSettingsLlm(): Promise<{ ok: true; model: string }> {
  const saved = await readSavedAppSettings()
  const config = saved ? getDeepSeekConfigForSettings(saved) : null
  if (!config) throw new Error("deepseek api key missing")

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
  return { ok: true, model: config.model }
}
