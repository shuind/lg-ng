import { NextResponse } from "next/server"
import { listBooks, createBook } from "@/lib/server/book-store"

export async function GET() {
  try {
    const books = await listBooks()
    return NextResponse.json(books)
  } catch (err) {
    console.error("[api/books] list error:", err)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const title = body.title ?? "未命名书籍"
    const book = await createBook(title)
    return NextResponse.json(book, { status: 201 })
  } catch (err) {
    console.error("[api/books] create error:", err)
    return NextResponse.json({ error: "创建书籍失败" }, { status: 500 })
  }
}
