import { NextResponse } from "next/server"
import { ReviewRequestError, runBookReview } from "@/lib/server/review-service"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const result = await runBookReview(bookId, await request.json())
    return NextResponse.json(result.payload, { status: result.status })
  } catch (err) {
    if (err instanceof ReviewRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error("[api/books/review] error:", err)
    return NextResponse.json({ error: "体检失败" }, { status: 500 })
  }
}
