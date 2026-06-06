import { NextResponse } from "next/server"
import { refreshStyleGuideSummary } from "@/lib/server/skill-service"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const result = await refreshStyleGuideSummary(bookId)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/books/skills/style-guide/refresh] error:", err)
    return NextResponse.json({ error: "刷新失败" }, { status: 500 })
  }
}
