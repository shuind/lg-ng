import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { listChapters, createChapter } from "@/lib/server/chapter-store"

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const chapters = await listChapters(bookId)
    return NextResponse.json(chapters)
  } catch (err) {
    console.error("[api/books/chapters] list error:", err)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json().catch(() => ({}))
    const chapter = await createChapter(bookId, body.title)
    return NextResponse.json(chapter)
  } catch (err) {
    console.error("[api/books/chapters] create error:", err)
    return NextResponse.json({ error: "创建失败" }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
export const POST = withAuthRoute(POSTHandler)
