import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { draftSkillFromCandidate } from "@/lib/server/skill-candidate-service"

async function POSTHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; candidateId: string }> },
) {
  try {
    const { bookId, candidateId } = await params
    return NextResponse.json(await draftSkillFromCandidate(bookId, candidateId))
  } catch (error) {
    console.error("[api/books/skills/candidates/draft] error:", error)
    return NextResponse.json({ error: "从候选生成 Skill 草稿失败。" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
