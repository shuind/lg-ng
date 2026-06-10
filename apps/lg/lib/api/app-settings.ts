import type { AppModelId, AppSettingsPayload } from "@/lib/app-settings"
import { readJsonResponse } from "./common"

export async function getAppSettings(): Promise<AppSettingsPayload> {
  const res = await fetch("/api/app-settings", { cache: "no-store" })
  return readJsonResponse<AppSettingsPayload>(res)
}

export async function updateAppSettings(input: { modelId: AppModelId }): Promise<AppSettingsPayload> {
  const res = await fetch("/api/app-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<AppSettingsPayload>(res)
}
