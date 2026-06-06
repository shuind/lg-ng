import { NextResponse } from "next/server"
import { createThread, forkThread, getThreadBundle, listThreads } from "@/lib/server/thread-store"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const threads = await listThreads(bookId)
    return NextResponse.json(threads)
  } catch (err) {
    console.error("[api/books/threads] GET error:", err)
    return NextResponse.json({ error: "读取线程失败" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === "string" ? body.title : undefined
    const forkFrom = body.forkFrom

    if (
      forkFrom &&
      typeof forkFrom.threadId === "string" &&
      typeof forkFrom.turnId === "string"
    ) {
      const bundle = await forkThread(bookId, forkFrom.threadId, forkFrom.turnId, title)
      return NextResponse.json(bundle, { status: 201 })
    }

    const thread = await createThread(bookId, { title: title || "新任务线程" })
    const bundle = await getThreadBundle(bookId, thread.id)
    return NextResponse.json(bundle ?? { thread, turns: [], messages: [] }, { status: 201 })
  } catch (err) {
    console.error("[api/books/threads] POST error:", err)
    return NextResponse.json({ error: "创建线程失败" }, { status: 500 })
  }
}
