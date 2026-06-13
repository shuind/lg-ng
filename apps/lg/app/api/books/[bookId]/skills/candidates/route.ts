import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { listSkillCandidates, refreshSkillCandidates } from "@/lib/server/skill-candidate-service"

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    return NextResponse.json(await listSkillCandidates(bookId))
  } catch (error) {
    console.error("[api/books/skills/candidates] error:", error)
    return NextResponse.json({ candidates: [], updatedAt: new Date().toISOString() }, { status: 200 })
  }
}

async function POSTHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    return NextResponse.json(await refreshSkillCandidates(bookId))
  } catch (error) {
    console.error("[api/books/skills/candidates] refresh error:", error)
    return NextResponse.json({ error: "刷新 Skill 候选失败。" }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
export const POST = withAuthRoute(POSTHandler)
