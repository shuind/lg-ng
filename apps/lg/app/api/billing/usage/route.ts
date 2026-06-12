import { NextResponse } from "next/server"
import { withAuthRoute } from "@/lib/server/auth-route"
import { getBillingUsageRange } from "@/lib/server/billing-store"

export const GET = withAuthRoute(async (request: Request) => {
  const url = new URL(request.url)
  const payload = await getBillingUsageRange({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    limit: url.searchParams.get("limit"),
  })
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }
  return NextResponse.json(payload)
})
