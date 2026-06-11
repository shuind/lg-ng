import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { updateInviteCode } from "@/lib/server/auth-store"

function inviteErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "邀请码保存失败"
  if (error.message === "invalid_invite_limit") return "请输入有效的人数上限"
  if (error.message === "invite_not_found") return "邀请码不存在或不可编辑"
  return "邀请码保存失败"
}

async function PUTHandler(
  request: Request,
  { params }: { params: Promise<{ codeHash: string }> },
) {
  try {
    const { codeHash } = await params
    const body = await request.json().catch(() => ({}))
    return NextResponse.json(await updateInviteCode({
      codeHash: decodeURIComponent(codeHash),
      maxRedemptions: (body as { maxRedemptions?: unknown }).maxRedemptions,
    }))
  } catch (error) {
    const status = error instanceof Error && error.message === "invite_not_found" ? 404 : 400
    return NextResponse.json({ error: inviteErrorMessage(error) }, { status })
  }
}

export const PUT = withAdminRoute(PUTHandler)
