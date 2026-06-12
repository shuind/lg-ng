import type { BillingAdminSummary, BillingUsageRangePayload, BillingUserSummary } from "@/lib/billing"
import { readJsonResponse } from "./common"

export async function getMyBillingSummary(): Promise<BillingUserSummary> {
  const res = await fetch("/api/billing/me", { cache: "no-store" })
  return readJsonResponse<BillingUserSummary>(res)
}

export async function getAdminBillingSummary(): Promise<BillingAdminSummary> {
  const res = await fetch("/api/admin/billing", { cache: "no-store" })
  return readJsonResponse<BillingAdminSummary>(res)
}

export async function getMyBillingUsageRange(input: {
  from?: string
  to?: string
  limit?: number
} = {}): Promise<BillingUsageRangePayload> {
  const params = new URLSearchParams()
  if (input.from) params.set("from", input.from)
  if (input.to) params.set("to", input.to)
  if (input.limit) params.set("limit", String(input.limit))
  const query = params.toString()
  const res = await fetch(`/api/billing/usage${query ? `?${query}` : ""}`, { cache: "no-store" })
  return readJsonResponse<BillingUsageRangePayload>(res)
}
