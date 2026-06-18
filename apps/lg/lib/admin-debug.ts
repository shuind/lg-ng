export const API_DEBUG_LOG_SETTINGS_FILE = "api-debug-log-settings.json"
export const MODEL_API_DEBUG_LOG_FILE = "model-api-calls.jsonl"

export type AdminApiDebugLogSource = "admin" | "environment" | "default"

export interface AdminApiDebugLogSettings {
  enabled: boolean
  runtimeEnabled: boolean
  envEnabled: boolean
  source: AdminApiDebugLogSource
  logDir: string
  logFile: string
  settingsPath: string
  updatedAt: string | null
  updatedByUserId: string | null
}

export interface AdminApiDebugLogSettingsUpdateInput {
  enabled: boolean
}
