import { NextResponse } from "next/server"
import { withAuthRoute } from "@/lib/server/auth-route"
import { listThreadMessages } from "@/lib/server/thread-store"
import { extractUserMemoryCandidates, getUserMemoryPayload } from "@/lib/server/user-memory-store"

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function POSTHandler(request: Request) {
  try {
    const body = await request.json()
    const bookId = cleanText(body.bookId)
    const threadId = cleanText(body.threadId)
    if (!bookId || !threadId) {
      return NextResponse.json({ error: "缺少 bookId 或 threadId" }, { status: 400 })
    }

    const messages = await listThreadMessages(bookId, threadId)
    await extractUserMemoryCandidates({ bookId, threadId, messages })
    return NextResponse.json(await getUserMemoryPayload(bookId, ""))
  } catch (err) {
    console.error("[api/user-memory/extract] POST error:", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "提炼 memory 候选失败" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
