export const DEFAULT_APP_MODEL_ID = "deepseek-v4-flash" as const
export const DEFAULT_PAYMENT_SOURCE = "balance" as const

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
export type AppPaymentSource = "balance" | "api"

export interface AppSettings {
  modelId: AppModelId
  paymentSource: AppPaymentSource
  updatedAt: string
  deepSeekKeyUpdatedAt?: string
}

export interface AppSettingsPayload extends AppSettings {
  saved: boolean
  activeProvider: "deepseek" | "none"
  activeModel: string | null
  deepSeekConfigured: boolean
  deepSeekKeyPreview: string | null
  modelOptions: typeof APP_MODEL_OPTIONS
}

export type UpdateAppSettingsInput = {
  modelId?: unknown
  paymentSource?: unknown
  deepSeekApiKey?: unknown
  clearDeepSeekApiKey?: unknown
}

export function isAppModelId(value: unknown): value is AppModelId {
  return typeof value === "string" && APP_MODEL_OPTIONS.some((option) => option.id === value)
}

export function normalizeAppModelId(value: unknown): AppModelId {
  return isAppModelId(value) ? value : DEFAULT_APP_MODEL_ID
}

export function isAppPaymentSource(value: unknown): value is AppPaymentSource {
  return value === "balance" || value === "api"
}

export function normalizeAppPaymentSource(
  value: unknown,
  fallback: AppPaymentSource = DEFAULT_PAYMENT_SOURCE,
): AppPaymentSource {
  return isAppPaymentSource(value) ? value : fallback
}
