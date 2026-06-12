import type { AppModelId, AppPaymentSource, AppSettingsPayload } from "@/lib/app-settings"
import { readJsonResponse } from "./common"

export async function getAppSettings(): Promise<AppSettingsPayload> {
  const res = await fetch("/api/app-settings", { cache: "no-store" })
  return readJsonResponse<AppSettingsPayload>(res)
}

export async function updateAppSettings(input: {
  modelId?: AppModelId
  paymentSource?: AppPaymentSource
  deepSeekApiKey?: string
  clearDeepSeekApiKey?: boolean
}): Promise<AppSettingsPayload> {
  const res = await fetch("/api/app-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<AppSettingsPayload>(res)
}

export async function testAppSettingsLlm(): Promise<{ ok: true; model: string }> {
  const res = await fetch("/api/app-settings/test-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  return readJsonResponse<{ ok: true; model: string }>(res)
}
