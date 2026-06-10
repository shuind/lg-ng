import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { getOpenAICompatibleConfig, type OpenAICompatibleConfig } from "novel-guide"
import {
  APP_MODEL_OPTIONS,
  DEFAULT_APP_MODEL_ID,
  isAppModelId,
  normalizeAppModelId,
  type AppModelId,
  type AppSettings,
  type AppSettingsPayload,
} from "@/lib/app-settings"
import { getDataRoot } from "@/lib/server/paths"

const APP_SETTINGS_FILE = "app-settings.json"
const DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z"

function appSettingsPath(): string {
  return path.join(getDataRoot(), APP_SETTINGS_FILE)
}

function normalizeAppSettings(data: unknown): AppSettings {
  const raw = data && typeof data === "object" ? data as Partial<AppSettings> : {}
  return {
    modelId: normalizeAppModelId(raw.modelId),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_UPDATED_AT,
  }
}

async function readSavedAppSettings(): Promise<AppSettings | null> {
  try {
    const raw = await fsp.readFile(appSettingsPath(), "utf8")
    return normalizeAppSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

function readSavedAppSettingsSync(): AppSettings | null {
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

function getDeepSeekConfigForModel(modelId: AppModelId): OpenAICompatibleConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null
  return {
    provider: "deepseek",
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: modelId,
  }
}

function buildPayload(saved: AppSettings | null): AppSettingsPayload {
  const settings = saved ?? {
    modelId: defaultModelIdFromEnv(),
    updatedAt: DEFAULT_UPDATED_AT,
  }
  const activeConfig = saved
    ? getDeepSeekConfigForModel(settings.modelId)
    : getOpenAICompatibleConfig()

  return {
    ...settings,
    saved: Boolean(saved),
    activeProvider: activeConfig?.provider ?? "none",
    activeModel: activeConfig?.model ?? null,
    deepSeekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    modelOptions: APP_MODEL_OPTIONS,
  }
}

export async function getAppSettings(): Promise<AppSettingsPayload> {
  return buildPayload(await readSavedAppSettings())
}

export async function saveAppSettings(input: { modelId: unknown }): Promise<AppSettingsPayload> {
  if (!isAppModelId(input.modelId)) {
    throw new Error("unsupported model")
  }

  const settings: AppSettings = {
    modelId: input.modelId,
    updatedAt: new Date().toISOString(),
  }
  await fsp.mkdir(getDataRoot(), { recursive: true })
  await fsp.writeFile(appSettingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8")
  return buildPayload(settings)
}

export function getEffectiveOpenAICompatibleConfig(): OpenAICompatibleConfig | null {
  const saved = readSavedAppSettingsSync()
  if (saved) return getDeepSeekConfigForModel(saved.modelId)
  return getOpenAICompatibleConfig()
}
