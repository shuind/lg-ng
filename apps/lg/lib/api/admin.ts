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
  redeemed: boolean
  redeemedByUserId: string | null
  redeemedByEmail: string | null
  redeemedAt: string | null
}

export type TrialQuotaSettings = {
  enabled: boolean
  totalBudgetCny: number
  perUserBudgetCny: number
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

export async function getAdminOverview(): Promise<AdminOverviewPayload> {
  const res = await fetch("/api/admin/overview", { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      const next = `${window.location.pathname}${window.location.search}`
      window.location.href = `/login?next=${encodeURIComponent(next)}`
    }
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "后台数据加载失败"
    throw new AdminApiError(res.status, message)
  }
  return data as AdminOverviewPayload
}

export async function updateAdminTrialQuotaSettings(
  input: Partial<Omit<TrialQuotaSettings, "updatedAt">>,
): Promise<TrialQuotaSummary> {
  const res = await fetch("/api/admin/quota", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "额度设置保存失败"
    throw new AdminApiError(res.status, message)
  }
  return data as TrialQuotaSummary
}
