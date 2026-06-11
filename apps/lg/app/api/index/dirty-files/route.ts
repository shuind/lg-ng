import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { getDirtyFiles } from "@/lib/server/dirty-index"

async function GETHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const bookId = searchParams.get("bookId") ?? undefined
    const entries = await getDirtyFiles(bookId)
    return NextResponse.json(entries)
  } catch (err) {
    console.error("[api/index/dirty-files] error:", err)
    return NextResponse.json([], { status: 200 })
  }
}

export const GET = withAuthRoute(GETHandler)
