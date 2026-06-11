import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/server/auth-route"

export async function POST(request: Request) {
  return clearSessionCookie(request, NextResponse.json({ ok: true }))
}
