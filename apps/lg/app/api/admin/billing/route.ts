import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { getAuthAdminSnapshot } from "@/lib/server/auth-store"
import { getBillingAdminSummary, updateBillingSettings } from "@/lib/server/billing-store"

export const GET = withAdminRoute(async () => {
  const snapshot = await getAuthAdminSnapshot()
  return NextResponse.json(await getBillingAdminSummary(snapshot.users.map((user) => user.id)))
})

export const PUT = withAdminRoute(async (request: Request) => {
  try {
    const rawBody = await request.json().catch(() => ({}))
    const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {}
    const rawPricing = body.pricing && typeof body.pricing === "object"
      ? body.pricing as Record<string, unknown>
      : {}
    await updateBillingSettings({
      platformEnabled: typeof body.platformEnabled === "boolean" ? body.platformEnabled : undefined,
      pricing: {
        promptCacheHitPricePerMillionCny: Number(rawPricing.promptCacheHitPricePerMillionCny),
        promptCacheMissPricePerMillionCny: Number(rawPricing.promptCacheMissPricePerMillionCny),
        outputPricePerMillionCny: Number(rawPricing.outputPricePerMillionCny),
      },
    })
    const snapshot = await getAuthAdminSnapshot()
    return NextResponse.json(await getBillingAdminSummary(snapshot.users.map((user) => user.id)))
  } catch (error) {
    console.error("[api/admin/billing] PUT error:", error)
    return NextResponse.json({ error: "保存余额设置失败" }, { status: 500 })
  }
})
