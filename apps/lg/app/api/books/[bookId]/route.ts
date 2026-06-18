import { withAuthRoute } from "@/lib/server/auth-route"
import { NextRequest, NextResponse } from "next/server"
import { deleteBook, updateBookTitle } from "@/lib/server/book-store"

async function PATCHHandler(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params
  const body = await req.json()
  const { title } = body as { title?: string }

  if (!title?.trim()) {
    return NextResponse.json({ error: "请输入书名" }, { status: 400 })
  }

  const book = await updateBookTitle(bookId, title.trim())
  if (!book) {
    return NextResponse.json({ error: "书籍不存在" }, { status: 404 })
  }

  return NextResponse.json(book)
}

async function DELETEHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params

  try {
    const deleted = await deleteBook(bookId)
    if (!deleted) {
      return NextResponse.json({ error: "书籍不存在" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[api/books/:id] delete error:", err)
    return NextResponse.json({ error: "删除书籍失败" }, { status: 500 })
  }
}

export const PATCH = withAuthRoute(PATCHHandler)
export const DELETE = withAuthRoute(DELETEHandler)
