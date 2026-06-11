import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { listBooks, createBook } from "@/lib/server/book-store"

async function GETHandler() {
  try {
    const books = await listBooks()
    return NextResponse.json(books)
  } catch (err) {
    console.error("[api/books] list error:", err)
    return NextResponse.json({ error: "读取书籍失败" }, { status: 500 })
  }
}

async function POSTHandler(request: Request) {
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

export const GET = withAuthRoute(GETHandler)
export const POST = withAuthRoute(POSTHandler)
