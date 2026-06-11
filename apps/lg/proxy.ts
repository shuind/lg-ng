import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE_NAME = "lg_session"

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  "/icon",
  "/apple-icon",
  "/placeholder",
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value)

  if (isPublicPath(pathname)) return NextResponse.next()

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
}
