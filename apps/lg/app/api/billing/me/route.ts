import { NextResponse } from "next/server"
import { withAuthRoute } from "@/lib/server/auth-route"
import { getBillingUserSummary } from "@/lib/server/billing-store"

export const GET = withAuthRoute(async () => {
  const summary = await getBillingUserSummary()
  if (!summary) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }
  return NextResponse.json(summary)
})
