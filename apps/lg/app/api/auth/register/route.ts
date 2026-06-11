import { NextResponse } from "next/server"
import { attachSessionCookie } from "@/lib/server/auth-route"
import { registerUser } from "@/lib/server/auth-store"

function authErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "注册失败"
  if (error.message === "invalid_email") return "请输入有效邮箱"
  if (error.message === "weak_password") return "密码至少需要 8 位"
  if (error.message === "email_exists") return "这个邮箱已经注册"
  if (error.message === "invite_not_configured") return "服务器未配置邀请码"
  if (error.message === "invalid_invite") return "邀请码无效"
  if (error.message === "invite_redeemed") return "邀请码已被使用"
  return "注册失败"
}

export async function POST(request: Request) {
  try {
    const session = await registerUser(await request.json().catch(() => ({})))
    return attachSessionCookie(NextResponse.json({ user: session.user }, { status: 201 }), session)
  } catch (error) {
    return NextResponse.json({ error: authErrorMessage(error) }, { status: 400 })
  }
}
