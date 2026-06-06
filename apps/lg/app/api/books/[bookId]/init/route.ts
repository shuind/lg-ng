import { NextResponse } from "next/server"
import { listChapters } from "@/lib/server/chapter-store"
import { listSettingCards } from "@/lib/server/setting-card-store"
import { listOutlineFiles } from "@/lib/server/book-store"
import { getResponseConstraintStore } from "@/lib/server/response-constraint-store"
import { ensureDefaultThread, getThreadBundle, listThreads } from "@/lib/server/thread-store"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const defaultThread = await ensureDefaultThread(bookId)
    const [chapters, outlines, threads, bundle, cards, responseConstraints] = await Promise.all([
      listChapters(bookId),
      listOutlineFiles(bookId),
      listThreads(bookId),
      getThreadBundle(bookId, defaultThread.id),
      listSettingCards(bookId),
      getResponseConstraintStore(bookId),
    ])
    return NextResponse.json({
      chapters,
      outlines,
      cards,
      responseConstraints: responseConstraints.constraints,
      threadConstraintIds: responseConstraints.threadEnabled,
      threads,
      activeThreadId: defaultThread.id,
      turns: bundle?.turns ?? [],
      messages: bundle?.messages ?? [],
    })
  } catch (err) {
    console.error("[api/books/init] error:", err)
    return NextResponse.json({ error: "初始化失败" }, { status: 500 })
  }
}
