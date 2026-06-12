import type { BillingAdminSummary, BillingUserSummary } from "@/lib/billing"

export type AdminUserOverview = {
  id: string
  email: string
  createdAt: string
  updatedAt: string
  inviteRedeemedAt: string | null
  activeSessionCount: number
  expiredSessionCount: number
  booksCount: number
  dataBytes: number
  dataUpdatedAt: string | null
  hasPersonalDeepSeekKey: boolean
  deepSeekKeyPreview: string | null
}

export type AdminInviteOverview = {
  code: string | null
  codeHash: string
  configured: boolean
  source: "managed" | "env" | "removed"
  editable: boolean
  redeemed: boolean
  redeemedByUserId: string | null
  redeemedByEmail: string | null
  redeemedAt: string | null
  redeemedCount: number
  maxRedemptions: number
  remainingRedemptions: number
  redeemedUsers: Array<{
    userId: string
    email: string | null
    redeemedAt: string
  }>
  createdAt: string | null
  updatedAt: string | null
}

export type TrialQuotaSettings = {
  enabled: boolean
  totalBudgetCny: number
  perUserBudgetCny: number
  userBudgetsCny: Record<string, number>
  promptCacheHitPricePerMillionCny: number
  promptCacheMissPricePerMillionCny: number
  outputPricePerMillionCny: number
  updatedAt: string
}

export type TrialQuotaSummary = {
  settings: TrialQuotaSettings
  platformApiKeyConfigured: boolean
  enforcementEnabled: boolean
  total: {
    promptTokens: number
    promptCacheHitTokens: number
    promptCacheMissTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostCny: number
    requestCount: number
    remainingCny: number
  }
  byUser: Array<{
    userId: string
    budgetCny: number
    remainingCny: number
    promptTokens: number
    promptCacheHitTokens: number
    promptCacheMissTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostCny: number
    requestCount: number
  }>
}

export type AdminOverviewPayload = {
  generatedAt: string
  dataRoot: string
  auth: {
    userCount: number
    inviteCodeCount: number
    inviteSlotCount: number
    redeemedInviteCount: number
    activeSessionCount: number
    expiredSessionCount: number
    adminEmailCount: number
    invites: AdminInviteOverview[]
  }
  storage: {
    totalUserDataBytes: number
  }
  llm: {
    userKeyModeEnabled: boolean
    platformQuotaEnabled: boolean
  }
  quota: TrialQuotaSummary
  billing: BillingAdminSummary
  users: AdminUserOverview[]
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "AdminApiError"
  }
}

async function readAdminResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      const next = `${window.location.pathname}${window.location.search}`
      window.location.href = `/login?next=${encodeURIComponent(next)}`
    }
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : fallbackMessage
    throw new AdminApiError(res.status, message)
  }
  return data as T
}

export async function getAdminOverview(): Promise<AdminOverviewPayload> {
  const res = await fetch("/api/admin/overview", { cache: "no-store" })
  return readAdminResponse<AdminOverviewPayload>(res, "后台数据加载失败")
}

export async function updateAdminTrialQuotaSettings(
  input: Partial<Omit<TrialQuotaSettings, "updatedAt">>,
): Promise<TrialQuotaSummary> {
  const res = await fetch("/api/admin/quota", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readAdminResponse<TrialQuotaSummary>(res, "额度设置保存失败")
}

export async function adjustAdminBillingBalance(input: {
  userId: string
  amountCny: number
  note?: string
}): Promise<BillingUserSummary> {
  const res = await fetch("/api/admin/billing/adjustments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readAdminResponse<BillingUserSummary>(res, "余额调整失败")
}

export async function createAdminInvite(input: {
  maxRedemptions: number
}): Promise<AdminInviteOverview> {
  const res = await fetch("/api/admin/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readAdminResponse<AdminInviteOverview>(res, "邀请码生成失败")
}

export async function updateAdminInvite(
  codeHash: string,
  input: { maxRedemptions: number },
): Promise<AdminInviteOverview> {
  const res = await fetch(`/api/admin/invites/${encodeURIComponent(codeHash)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readAdminResponse<AdminInviteOverview>(res, "邀请码保存失败")
}
