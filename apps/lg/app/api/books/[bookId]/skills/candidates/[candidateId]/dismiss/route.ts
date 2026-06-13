import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { dismissSkillCandidate } from "@/lib/server/skill-candidate-service"

async function POSTHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; candidateId: string }> },
) {
  try {
    const { bookId, candidateId } = await params
    return NextResponse.json(await dismissSkillCandidate(bookId, candidateId))
  } catch (error) {
    console.error("[api/books/skills/candidates/dismiss] error:", error)
    return NextResponse.json({ error: "忽略 Skill 候选失败。" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
