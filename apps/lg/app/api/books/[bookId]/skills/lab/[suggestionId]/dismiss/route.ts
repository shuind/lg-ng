import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { dismissSkillSuggestion } from "@/lib/server/skill-lab-service"

async function POSTHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; suggestionId: string }> },
) {
  try {
    const { bookId, suggestionId } = await params
    return NextResponse.json(await dismissSkillSuggestion(bookId, suggestionId))
  } catch (error) {
    console.error("[api/books/skills/lab/dismiss] error:", error)
    return NextResponse.json({ error: "忽略 Skill 建议失败。" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
