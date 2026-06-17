import type { AppModelId, AppPaymentSource, AppProviderId, AppSettingsPayload } from "@/lib/app-settings"
import { readJsonResponse } from "./common"

export async function getAppSettings(): Promise<AppSettingsPayload> {
  const res = await fetch("/api/app-settings", { cache: "no-store" })
  return readJsonResponse<AppSettingsPayload>(res)
}

export async function updateAppSettings(input: {
  provider?: AppProviderId
  modelId?: AppModelId
  paymentSource?: AppPaymentSource
  providerApiKey?: string
  providerBaseUrl?: string
  clearProviderApiKey?: boolean
  deepSeekApiKey?: string
  clearDeepSeekApiKey?: boolean
  customProviderId?: string
  customProviderLabel?: string
  customProviderBaseUrl?: string
  customProviderModelId?: string
  customProviderApiKey?: string
  deleteCustomProviderId?: string
}): Promise<AppSettingsPayload> {
  const res = await fetch("/api/app-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<AppSettingsPayload>(res)
}

export async function testAppSettingsLlm(): Promise<{ ok: true; model: string; provider: AppProviderId }> {
  const res = await fetch("/api/app-settings/test-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  return readJsonResponse<{ ok: true; model: string; provider: AppProviderId }>(res)
}
