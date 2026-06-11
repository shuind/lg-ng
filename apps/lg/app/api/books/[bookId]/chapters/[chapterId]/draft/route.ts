import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { generateDraftForChapter } from "@/lib/server/draft-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  try {
    const { bookId, chapterId } = await params
    const body = await request.json().catch(() => ({}))
    const draft = await generateDraftForChapter({
      bookId,
      chapterId,
      prompt: body.prompt,
    })
    return NextResponse.json({ draft })
  } catch (err) {
    console.error("[api/books/chapters/:id/draft] error:", err)
    return NextResponse.json({ error: "生成失败" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
