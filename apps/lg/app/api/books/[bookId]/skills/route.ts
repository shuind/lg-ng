import { NextResponse } from "next/server"
import {
  createClaudeSkill,
  listSkills,
  SkillConflictError,
  SkillValidationError,
} from "@/lib/server/skill-service"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const skills = await listSkills(bookId)
    return NextResponse.json(skills)
  } catch (err) {
    console.error("[api/books/skills] error:", err)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const skill = await createClaudeSkill(bookId, body)
    return NextResponse.json({ skill }, { status: 201 })
  } catch (err) {
    if (err instanceof SkillConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof SkillValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    console.error("[api/books/skills] create error:", err)
    return NextResponse.json({ error: "创建 Skill 失败。" }, { status: 500 })
  }
}
