export type PaymentSource = "balance" | "api"

export type BillingLedgerEntryType =
  | "credit_adjustment"
  | "debit_adjustment"
  | "usage"
  | "usage_estimate"
  | "balance_migration"

export type BillingSubscriptionPlanId = "starter_1" | "standard_8" | "pro_18" | "max_28"

export interface BillingSubscriptionPlan {
  id: BillingSubscriptionPlanId
  priceCny: number
  commissionRate: number
  allowsApiKey: boolean
}

export interface BillingPricing {
  promptCacheHitPricePerMillionCny: number
  promptCacheMissPricePerMillionCny: number
  outputPricePerMillionCny: number
}

export interface BillingSettings {
  version: 1
  mode: "trial" | "subscription"
  platformEnabled: boolean
  pricing: BillingPricing
  subscriptionPlans: BillingSubscriptionPlan[]
  migratedLegacyBalanceAt?: string
  updatedAt: string
}

export interface BillingSettingsUpdateInput {
  platformEnabled?: boolean
  pricing?: Partial<BillingPricing>
}

export type BillingPlatformKeySource = "environment" | "admin" | "none"

export interface BillingPlatformKeyStatus {
  platformApiKeyConfigured: boolean
  platformKeySource: BillingPlatformKeySource
  platformKeyPreview: string | null
  platformKeyUpdatedAt: string | null
}

export interface BillingUsageDetails {
  paymentSource: PaymentSource
  promptTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostCny: number
  chargedAmountCny: number
  commissionAmountCny: number
  balanceAfterCny: number | null
}

export interface BillingLedgerEntry extends Partial<BillingUsageDetails> {
  id: string
  userId: string
  type: BillingLedgerEntryType
  amountCny: number
  balanceAfterCny: number | null
  provider?: string
  model?: string
  feature?: string
  note?: string
  createdByUserId?: string | null
  createdAt: string
}

export interface BillingUserSummary {
  userId: string
  balanceCny: number
  usedBalanceCny: number
  estimatedCostCny: number
  apiEstimatedCostCny: number
  requestCount: number
  promptTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  totalTokens: number
  canUseBalance: boolean
  platformApiKeyConfigured: boolean
  platformEnabled: boolean
  recentEntries: BillingLedgerEntry[]
}

export interface BillingUsageRangeSummary {
  from: string | null
  to: string | null
  promptTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostCny: number
  chargedAmountCny: number
  commissionAmountCny: number
  requestCount: number
}

export interface BillingUsageRangePayload {
  summary: BillingUsageRangeSummary
  entries: BillingLedgerEntry[]
}

export interface BillingAdminSummary {
  settings: BillingSettings
  platformApiKeyConfigured: boolean
  platformKeySource: BillingPlatformKeySource
  platformKeyPreview: string | null
  platformKeyUpdatedAt: string | null
  total: Omit<BillingUserSummary, "userId" | "recentEntries" | "canUseBalance" | "platformApiKeyConfigured" | "platformEnabled">
  byUser: BillingUserSummary[]
}

export const BILLING_SUBSCRIPTION_PLANS: BillingSubscriptionPlan[] = [
  { id: "starter_1", priceCny: 1, commissionRate: 0.1, allowsApiKey: false },
  { id: "standard_8", priceCny: 8, commissionRate: 0.05, allowsApiKey: false },
  { id: "pro_18", priceCny: 18, commissionRate: 0.01, allowsApiKey: false },
  { id: "max_28", priceCny: 28, commissionRate: 0, allowsApiKey: true },
]
