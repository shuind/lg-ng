export const DEFAULT_APP_PROVIDER = "deepseek"
export const DEFAULT_APP_MODEL_ID = "deepseek-v4-flash"
export const DEFAULT_PAYMENT_SOURCE = "balance" as const

export type AppProviderId = string
export type AppModelId = string
export type AppPaymentSource = "balance" | "api"

export interface AppProviderOption {
  id: AppProviderId
  label: string
  description: string
  defaultBaseUrl: string
  supportsBalance: boolean
  apiKeyPlaceholder: string
  custom?: boolean
}

export interface AppModelOption {
  id: AppModelId
  label: string
  provider: AppProviderId
  description: string
  custom?: boolean
}

export interface AppCustomProvider {
  id: AppProviderId
  label: string
  baseUrl: string
  modelId: AppModelId
  configured: boolean
  keyPreview: string | null
  keyUpdatedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AppPlatformOption {
  id: string
  label: string
  provider: string
  modelId: string
  enabled: boolean
  configured: boolean
  source: "environment" | "admin"
  default: boolean
}

export interface AppUserProviderOption {
  id: AppProviderId
  label: string
  configured: boolean
  custom?: boolean
}

export const APP_PROVIDER_OPTIONS: AppProviderOption[] = [
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
]

export const APP_MODEL_OPTIONS: AppModelOption[] = [
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
]

export interface AppSettings {
  provider: AppProviderId
  modelId: AppModelId
  paymentSource: AppPaymentSource
  platformProviderId?: string | null
  updatedAt: string
  providerKeyUpdatedAt?: string
  deepSeekKeyUpdatedAt?: string
  customProviders: AppCustomProvider[]
}

export interface AppSettingsPayload extends AppSettings {
  saved: boolean
  activeProvider: AppProviderId | "none"
  activeModel: string | null
  platformProvider: string | null
  platformModel: string | null
  platformProviderId: string | null
  platformOptions: AppPlatformOption[]
  userProviderOptions: AppUserProviderOption[]
  canUseBalance: boolean
  platformEnabled: boolean
  providerConfigured: boolean
  providerKeyPreview: string | null
  providerBaseUrl: string | null
  providerOptions: AppProviderOption[]
  modelOptions: AppModelOption[]
  deepSeekConfigured: boolean
  deepSeekKeyPreview: string | null
}

export type UpdateAppSettingsInput = {
  provider?: unknown
  modelId?: unknown
  paymentSource?: unknown
  platformProviderId?: unknown
  providerApiKey?: unknown
  providerBaseUrl?: unknown
  clearProviderApiKey?: unknown
  deepSeekApiKey?: unknown
  clearDeepSeekApiKey?: unknown
  customProviderId?: unknown
  customProviderLabel?: unknown
  customProviderBaseUrl?: unknown
  customProviderModelId?: unknown
  customProviderApiKey?: unknown
  deleteCustomProviderId?: unknown
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function isAppProviderId(value: unknown): value is AppProviderId {
  return isNonEmptyString(value)
}

export function isBuiltinAppProviderId(value: unknown): value is AppProviderId {
  return typeof value === "string" && APP_PROVIDER_OPTIONS.some((option) => option.id === value)
}

export function normalizeAppProviderId(value: unknown): AppProviderId {
  return isAppProviderId(value) ? value.trim() : DEFAULT_APP_PROVIDER
}

export function getBuiltinProviderOption(provider: AppProviderId) {
  return APP_PROVIDER_OPTIONS.find((option) => option.id === provider)
}

export function getAppProviderOption(provider: AppProviderId, customProviders: AppCustomProvider[] = []): AppProviderOption {
  const builtin = getBuiltinProviderOption(provider)
  if (builtin) return builtin
  const custom = customProviders.find((option) => option.id === provider)
  return {
    id: provider,
    label: custom?.label ?? provider,
    description: "自定义 OpenAI 兼容接口。",
    defaultBaseUrl: custom?.baseUrl ?? "",
    supportsBalance: false,
    apiKeyPlaceholder: "sk-...",
    custom: true,
  }
}

export function isAppModelId(value: unknown): value is AppModelId {
  return isNonEmptyString(value)
}

export function isModelForProvider(modelId: AppModelId, provider: AppProviderId): boolean {
  const preset = APP_MODEL_OPTIONS.find((option) => option.id === modelId)
  return preset ? preset.provider === provider : isAppModelId(modelId)
}

export function getDefaultModelForProvider(provider: AppProviderId, customProviders: AppCustomProvider[] = []): AppModelId {
  const custom = customProviders.find((option) => option.id === provider)
  if (custom?.modelId) return custom.modelId
  return APP_MODEL_OPTIONS.find((option) => option.provider === provider)?.id ?? DEFAULT_APP_MODEL_ID
}

export function normalizeAppModelId(
  value: unknown,
  provider: AppProviderId = DEFAULT_APP_PROVIDER,
  customProviders: AppCustomProvider[] = [],
): AppModelId {
  const modelId = isAppModelId(value) ? value.trim() : ""
  return modelId && isModelForProvider(modelId, provider)
    ? modelId
    : getDefaultModelForProvider(provider, customProviders)
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
