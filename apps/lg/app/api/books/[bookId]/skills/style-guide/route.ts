import { NextResponse } from "next/server"
import { getStyleGuideSkill } from "@/lib/server/skill-service"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const result = await getStyleGuideSkill(bookId)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/books/skills/style-guide] error:", err)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}
