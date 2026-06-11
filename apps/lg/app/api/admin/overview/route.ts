import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { getAdminOverview } from "@/lib/server/admin-overview"

export const GET = withAdminRoute(async () => {
  return NextResponse.json(await getAdminOverview())
})
