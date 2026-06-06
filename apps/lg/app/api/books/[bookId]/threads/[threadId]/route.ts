import { NextResponse } from "next/server"
import { getThreadBundle, updateThread } from "@/lib/server/thread-store"
import type { Thread } from "@/lib/types"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; threadId: string }> },
) {
  try {
    const { bookId, threadId } = await params
    const bundle = await getThreadBundle(bookId, threadId)
    if (!bundle) return NextResponse.json({ error: "线程不存在" }, { status: 404 })
    return NextResponse.json(bundle)
  } catch (err) {
    console.error("[api/books/threads/thread] GET error:", err)
    return NextResponse.json({ error: "读取线程失败" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string; threadId: string }> },
) {
  try {
    const { bookId, threadId } = await params
    const body = await request.json()
    const patch: { title?: string; status?: Thread["status"] } = {}

    if (typeof body.title === "string") patch.title = body.title
    if (body.status === "active" || body.status === "archived" || body.status === "deleted") {
      patch.status = body.status
    }

    const thread = await updateThread(bookId, threadId, patch)
    if (!thread) return NextResponse.json({ error: "线程不存在" }, { status: 404 })
    return NextResponse.json({ thread })
  } catch (err) {
    console.error("[api/books/threads/thread] PATCH error:", err)
    return NextResponse.json({ error: "更新线程失败" }, { status: 500 })
  }
}
