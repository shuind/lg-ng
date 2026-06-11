import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { getTrialQuotaSummary, updateTrialQuotaSettings } from "@/lib/server/trial-quota-store"

export const GET = withAdminRoute(async () => {
  return NextResponse.json(await getTrialQuotaSummary())
})

export const PUT = withAdminRoute(async (request: Request) => {
  const body = await request.json().catch(() => ({}))
  await updateTrialQuotaSettings({
    enabled: body.enabled,
    totalBudgetCny: body.totalBudgetCny,
    perUserBudgetCny: body.perUserBudgetCny,
    promptCacheHitPricePerMillionCny: body.promptCacheHitPricePerMillionCny,
    promptCacheMissPricePerMillionCny: body.promptCacheMissPricePerMillionCny,
    outputPricePerMillionCny: body.outputPricePerMillionCny,
  })
  return NextResponse.json(await getTrialQuotaSummary())
})
