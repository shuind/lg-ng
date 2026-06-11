import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { listLedgerEntries } from "@/lib/server/ledger"

async function GETHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get("limit")
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined
    const cursor = searchParams.get("cursor") ?? undefined
    const response = await listLedgerEntries(bookId, { limit, cursor })
    return NextResponse.json(response)
  } catch (err) {
    console.error("[api/books/ledger] error:", err)
    return NextResponse.json({ entries: [] }, { status: 200 })
  }
}

export const GET = withAuthRoute(GETHandler)
