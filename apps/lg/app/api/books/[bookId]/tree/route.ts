import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { getBookTree } from "@/lib/server/book-store"

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const tree = await getBookTree(bookId)
    return NextResponse.json(tree)
  } catch (err) {
    console.error("[api/books/tree] error:", err)
    return NextResponse.json([], { status: 200 })
  }
}

export const GET = withAuthRoute(GETHandler)
