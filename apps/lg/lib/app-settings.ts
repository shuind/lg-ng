export const DEFAULT_APP_PROVIDER = "deepseek" as const
export const DEFAULT_APP_MODEL_ID = "deepseek-v4-flash" as const
export const DEFAULT_PAYMENT_SOURCE = "balance" as const

export const APP_PROVIDER_OPTIONS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "默认主力模型，优先使用 V4 Flash。",
    defaultBaseUrl: "https://api.deepseek.com",
    supportsBalance: true,
    apiKeyPlaceholder: "sk-...",
  },
  {
    id: "claude-relay",
    label: "Claude 中转",
    description: "通过 OpenAI 兼容中转站调用 Claude，作为备用选择。",
    defaultBaseUrl: "",
    supportsBalance: false,
    apiKeyPlaceholder: "sk-...",
  },
  {
    id: "mimo",
    label: "Mimo",
    description: "OpenAI 兼容接口，适合作为其它备用模型。",
    defaultBaseUrl: "https://api.mimo-v2.com/v1",
    supportsBalance: false,
    apiKeyPlaceholder: "sk-...",
  },
] as const

export const APP_MODEL_OPTIONS = [
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "deepseek",
    description: "默认推荐，日常写作速度和成本更均衡。",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "更强的 DeepSeek 模型，适合复杂推理。",
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "claude-relay",
    description: "Claude 中转站高能力模型，成本通常更高。",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "claude-relay",
    description: "Claude 中转站常用模型。",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "claude-relay",
    description: "Claude 轻量模型。",
  },
  {
    id: "mimo-v2.5-pro",
    label: "Mimo V2.5 Pro",
    provider: "mimo",
    description: "Mimo 备用模型。",
  },
] as const

export type AppProviderId = (typeof APP_PROVIDER_OPTIONS)[number]["id"]
export type AppModelId = (typeof APP_MODEL_OPTIONS)[number]["id"]
export type AppPaymentSource = "balance" | "api"

export interface AppSettings {
  provider: AppProviderId
  modelId: AppModelId
  paymentSource: AppPaymentSource
  updatedAt: string
  providerKeyUpdatedAt?: string
  deepSeekKeyUpdatedAt?: string
}

export interface AppSettingsPayload extends AppSettings {
  saved: boolean
  activeProvider: AppProviderId | "none"
  activeModel: string | null
  providerConfigured: boolean
  providerKeyPreview: string | null
  providerBaseUrl: string | null
  providerOptions: typeof APP_PROVIDER_OPTIONS
  modelOptions: typeof APP_MODEL_OPTIONS
  deepSeekConfigured: boolean
  deepSeekKeyPreview: string | null
}

export type UpdateAppSettingsInput = {
  provider?: unknown
  modelId?: unknown
  paymentSource?: unknown
  providerApiKey?: unknown
  providerBaseUrl?: unknown
  clearProviderApiKey?: unknown
  deepSeekApiKey?: unknown
  clearDeepSeekApiKey?: unknown
}

export function isAppProviderId(value: unknown): value is AppProviderId {
  return typeof value === "string" && APP_PROVIDER_OPTIONS.some((option) => option.id === value)
}

export function normalizeAppProviderId(value: unknown): AppProviderId {
  return isAppProviderId(value) ? value : DEFAULT_APP_PROVIDER
}

export function getAppProviderOption(provider: AppProviderId) {
  return APP_PROVIDER_OPTIONS.find((option) => option.id === provider) ?? APP_PROVIDER_OPTIONS[0]
}

export function isAppModelId(value: unknown): value is AppModelId {
  return typeof value === "string" && APP_MODEL_OPTIONS.some((option) => option.id === value)
}

export function isModelForProvider(modelId: AppModelId, provider: AppProviderId): boolean {
  return APP_MODEL_OPTIONS.some((option) => option.id === modelId && option.provider === provider)
}

export function getDefaultModelForProvider(provider: AppProviderId): AppModelId {
  return APP_MODEL_OPTIONS.find((option) => option.provider === provider)?.id ?? DEFAULT_APP_MODEL_ID
}

export function normalizeAppModelId(value: unknown, provider: AppProviderId = DEFAULT_APP_PROVIDER): AppModelId {
  return isAppModelId(value) && isModelForProvider(value, provider)
    ? value
    : getDefaultModelForProvider(provider)
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
