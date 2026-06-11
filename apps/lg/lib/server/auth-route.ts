import { NextResponse } from "next/server"
import {
  SESSION_COOKIE_NAME,
  deleteSessionToken,
  getUserBySessionToken,
  isAdminEmail,
  sessionCookieOptions,
  type AuthSessionResult,
} from "@/lib/server/auth-store"
import { runWithRequestContext } from "@/lib/server/request-context"

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=")
    if (rawKey === name) return decodeURIComponent(rawValue.join("="))
  }
  return null
}

export function getSessionTokenFromRequest(request: Request): string | null {
  return parseCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME)
}

export async function getAuthenticatedUser(request: Request) {
  return getUserBySessionToken(getSessionTokenFromRequest(request))
}

export function withAuthRoute<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Response | Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    const request = args[0] instanceof Request ? args[0] : null
    if (!request) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 })
    }

    return runWithRequestContext({ userId: user.id }, () => handler(...args))
  }
}

export function withAdminRoute<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Response | Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    const request = args[0] instanceof Request ? args[0] : null
    if (!request) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 })
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "没有后台访问权限" }, { status: 403 })
    }

    return runWithRequestContext({ userId: user.id }, () => handler(...args))
  }
}

export function attachSessionCookie(response: NextResponse, session: AuthSessionResult): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt))
  return response
}

export async function clearSessionCookie(request: Request, response: NextResponse): Promise<NextResponse> {
  await deleteSessionToken(getSessionTokenFromRequest(request))
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
}
