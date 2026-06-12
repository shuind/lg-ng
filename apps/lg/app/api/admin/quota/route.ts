import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { getTrialQuotaSummary, updateTrialQuotaSettings } from "@/lib/server/trial-quota-store"

export const GET = withAdminRoute(async () => {
  return NextResponse.json(await getTrialQuotaSummary())
})

export const PUT = withAdminRoute(async (request: Request) => {
  const rawBody = await request.json().catch(() => ({}))
  const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {}
  const input = Object.fromEntries(
    [
      "enabled",
      "totalBudgetCny",
      "perUserBudgetCny",
      "userBudgetsCny",
      "promptCacheHitPricePerMillionCny",
      "promptCacheMissPricePerMillionCny",
      "outputPricePerMillionCny",
    ].flatMap((key) => body[key] === undefined ? [] : [[key, body[key]]]),
  )
  await updateTrialQuotaSettings(input)
  return NextResponse.json(await getTrialQuotaSummary())
})
