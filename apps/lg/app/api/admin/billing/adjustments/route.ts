import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { getAuthAdminSnapshot } from "@/lib/server/auth-store"
import { adjustBillingBalance } from "@/lib/server/billing-store"
import { getCurrentUserId } from "@/lib/server/request-context"

export const POST = withAdminRoute(async (request: Request) => {
  try {
    const rawBody = await request.json().catch(() => ({}))
    const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {}
    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    const amountCny = Number(body.amountCny)
    const note = typeof body.note === "string" ? body.note : undefined
    const snapshot = await getAuthAdminSnapshot()
    if (!snapshot.users.some((user) => user.id === userId)) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }
    const summary = await adjustBillingBalance({
      userId,
      amountCny,
      note,
      createdByUserId: getCurrentUserId(),
    })
    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error && error.message === "insufficient_balance"
      ? "余额不足，不能扣成负数"
      : error instanceof Error && error.message === "invalid_amount"
        ? "请输入有效金额"
        : "余额调整失败"
    const status = message === "余额调整失败" ? 500 : 400
    return NextResponse.json({ error: message }, { status })
  }
})
