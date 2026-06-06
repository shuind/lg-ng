import { NextResponse } from "next/server"
import { retrieveContext } from "@/lib/server/retrieval"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const { query } = body

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "缺少 query" }, { status: 400 })
    }

    const results = await retrieveContext(bookId, query)
    return NextResponse.json(results)
  } catch (err) {
    console.error("[api/books/retrieve] error:", err)
    return NextResponse.json([], { status: 200 })
  }
}
