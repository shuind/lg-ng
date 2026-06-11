import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { createInviteCode } from "@/lib/server/auth-store"

function inviteErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "邀请码生成失败"
  if (error.message === "invalid_invite_limit") return "请输入有效的人数上限"
  if (error.message === "invite_generation_failed") return "邀请码生成失败，请重试"
  return "邀请码生成失败"
}

async function POSTHandler(request: Request) {
  try {
    const invite = await createInviteCode(await request.json().catch(() => ({})))
    return NextResponse.json(invite, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: inviteErrorMessage(error) }, { status: 400 })
  }
}

export const POST = withAdminRoute(POSTHandler)
