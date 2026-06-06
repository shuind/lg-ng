import { NextRequest, NextResponse } from "next/server"
import { updateBookTitle } from "@/lib/server/book-store"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params
  const body = await req.json()
  const { title } = body as { title?: string }

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  const book = await updateBookTitle(bookId, title.trim())
  if (!book) {
    return NextResponse.json({ error: "book not found" }, { status: 404 })
  }

  return NextResponse.json(book)
}
