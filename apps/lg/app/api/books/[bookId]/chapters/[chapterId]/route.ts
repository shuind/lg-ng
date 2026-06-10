import { NextResponse } from "next/server"
import { deleteChapter, getChapter, saveChapter } from "@/lib/server/chapter-store"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  try {
    const { bookId, chapterId } = await params
    const chapter = await getChapter(bookId, chapterId)
    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 })
    }
    return NextResponse.json(chapter)
  } catch (err) {
    console.error("[api/books/chapters/:id] get error:", err)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  try {
    const { bookId, chapterId } = await params
    const deleted = await deleteChapter(bookId, chapterId)
    if (!deleted) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 })
    }
    return NextResponse.json({ success: true, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error("[api/books/chapters/:id] delete error:", err)
    return NextResponse.json({ error: "删除失败" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  try {
    const { bookId, chapterId } = await params
    const body = await request.json()
    if (typeof body.content !== "string") {
      return NextResponse.json({ error: "缺少 content" }, { status: 400 })
    }
    const chapter = await saveChapter(bookId, chapterId, body.content)
    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 })
    }
    return NextResponse.json(chapter)
  } catch (err) {
    console.error("[api/books/chapters/:id] save error:", err)
    return NextResponse.json({ error: "保存失败" }, { status: 500 })
  }
}
