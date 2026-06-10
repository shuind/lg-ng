export const DEFAULT_APP_MODEL_ID = "deepseek-v4-flash" as const

export const APP_MODEL_OPTIONS = [
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek Flash",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek Pro",
  },
] as const

export type AppModelId = (typeof APP_MODEL_OPTIONS)[number]["id"]

export interface AppSettings {
  modelId: AppModelId
  updatedAt: string
}

export interface AppSettingsPayload extends AppSettings {
  saved: boolean
  activeProvider: "deepseek" | "mimo" | "none"
  activeModel: string | null
  deepSeekConfigured: boolean
  modelOptions: typeof APP_MODEL_OPTIONS
}

export function isAppModelId(value: unknown): value is AppModelId {
  return typeof value === "string" && APP_MODEL_OPTIONS.some((option) => option.id === value)
}

export function normalizeAppModelId(value: unknown): AppModelId {
  return isAppModelId(value) ? value : DEFAULT_APP_MODEL_ID
}
