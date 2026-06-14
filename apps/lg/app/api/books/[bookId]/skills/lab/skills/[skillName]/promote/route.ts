import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { promoteSkill, SkillNotFoundError, SkillValidationError } from "@/lib/server/skill-service"

async function POSTHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; skillName: string }> },
) {
  try {
    const { bookId, skillName } = await params
    const skill = await promoteSkill(bookId, decodeURIComponent(skillName))
    return NextResponse.json({ skill })
  } catch (error) {
    if (error instanceof SkillNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof SkillValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[api/books/skills/lab/promote] error:", error)
    return NextResponse.json({ error: "Skill 毕业失败。" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
