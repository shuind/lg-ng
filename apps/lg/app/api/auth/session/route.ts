import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/server/auth-route"

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user })
}
