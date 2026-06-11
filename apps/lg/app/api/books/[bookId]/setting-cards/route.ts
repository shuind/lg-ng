import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { listSettingCards } from "@/lib/server/setting-card-store"

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const cards = await listSettingCards(bookId)
    return NextResponse.json(cards)
  } catch (err) {
    console.error("[api/books/setting-cards] error:", err)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
