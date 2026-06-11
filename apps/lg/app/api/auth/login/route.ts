import { NextResponse } from "next/server"
import { attachSessionCookie } from "@/lib/server/auth-route"
import { loginUser } from "@/lib/server/auth-store"

function authErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "登录失败"
  if (error.message === "invalid_credentials") return "邮箱或密码不正确"
  return "登录失败"
}

export async function POST(request: Request) {
  try {
    const session = await loginUser(await request.json().catch(() => ({})))
    return attachSessionCookie(NextResponse.json({ user: session.user }), session)
  } catch (error) {
    return NextResponse.json({ error: authErrorMessage(error) }, { status: 400 })
  }
}
