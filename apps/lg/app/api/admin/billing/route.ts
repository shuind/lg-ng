import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { getAuthAdminSnapshot } from "@/lib/server/auth-store"
import { getBillingAdminSummary } from "@/lib/server/billing-store"

export const GET = withAdminRoute(async () => {
  const snapshot = await getAuthAdminSnapshot()
  return NextResponse.json(await getBillingAdminSummary(snapshot.users.map((user) => user.id)))
})
