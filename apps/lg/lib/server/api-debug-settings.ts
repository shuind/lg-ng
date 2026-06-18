import fsp from "node:fs/promises"
import path from "node:path"
import {
  API_DEBUG_LOG_SETTINGS_FILE,
  MODEL_API_DEBUG_LOG_FILE,
  type AdminApiDebugLogSettings,
  type AdminApiDebugLogSettingsUpdateInput,
} from "@/lib/admin-debug"
import { getGlobalDataRoot } from "@/lib/server/paths"
import { getCurrentUserId } from "@/lib/server/request-context"

type StoredApiDebugLogSettings = {
  enabled?: boolean
  logDir?: string
  updatedAt?: string
  updatedByUserId?: string | null
}

function adminDir(): string {
  return path.join(getGlobalDataRoot(), "admin")
}

function settingsPath(): string {
  return path.join(adminDir(), API_DEBUG_LOG_SETTINGS_FILE)
}

function defaultLogDir(): string {
  return path.join(getGlobalDataRoot(), "api-calls")
}

function normalizeLogDir(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? path.resolve(value.trim())
    : defaultLogDir()
}

async function readStoredSettings(): Promise<StoredApiDebugLogSettings> {
  try {
    const raw = JSON.parse(await fsp.readFile(settingsPath(), "utf8")) as StoredApiDebugLogSettings
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

export async function getApiDebugLogSettings(): Promise<AdminApiDebugLogSettings> {
  const stored = await readStoredSettings()
  const envEnabled = process.env.NG_API_DEBUG_LOG === "true"
  const runtimeEnabled = stored.enabled === true
  const logDir = process.env.NG_API_DEBUG_LOG_DIR
    ? path.resolve(process.env.NG_API_DEBUG_LOG_DIR)
    : normalizeLogDir(stored.logDir)
  const source = envEnabled ? "environment" : runtimeEnabled ? "admin" : "default"

  return {
    enabled: envEnabled || runtimeEnabled,
    runtimeEnabled,
    envEnabled,
    source,
    logDir,
    logFile: path.join(logDir, MODEL_API_DEBUG_LOG_FILE),
    settingsPath: settingsPath(),
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : null,
    updatedByUserId: typeof stored.updatedByUserId === "string" ? stored.updatedByUserId : null,
  }
}

export async function updateApiDebugLogSettings(
  input: AdminApiDebugLogSettingsUpdateInput,
): Promise<AdminApiDebugLogSettings> {
  const existing = await readStoredSettings()
  const next: StoredApiDebugLogSettings = {
    enabled: input.enabled === true,
    logDir: normalizeLogDir(existing.logDir),
    updatedAt: new Date().toISOString(),
    updatedByUserId: getCurrentUserId() ?? null,
  }
  await fsp.mkdir(adminDir(), { recursive: true })
  await fsp.writeFile(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8")
  return getApiDebugLogSettings()
}
