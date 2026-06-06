import { NextResponse } from "next/server"
import {
  readClaudeSkillDraft,
  SkillConflictError,
  SkillNotFoundError,
  SkillValidationError,
  updateClaudeSkill,
} from "@/lib/server/skill-service"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; skillName: string }> },
) {
  try {
    const { bookId, skillName } = await params
    const draft = await readClaudeSkillDraft(bookId, decodeURIComponent(skillName))
    return NextResponse.json(draft)
  } catch (err) {
    if (err instanceof SkillNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof SkillValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    console.error("[api/books/skills/:skillName] read error:", err)
    return NextResponse.json({ error: "读取 Skill 失败。" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookId: string; skillName: string }> },
) {
  try {
    const { bookId, skillName } = await params
    const body = await request.json()
    const skill = await updateClaudeSkill(bookId, {
      ...body,
      originalName: decodeURIComponent(skillName),
    })
    return NextResponse.json({ skill })
  } catch (err) {
    if (err instanceof SkillConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof SkillNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof SkillValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    console.error("[api/books/skills/:skillName] update error:", err)
    return NextResponse.json({ error: "更新 Skill 失败。" }, { status: 500 })
  }
}
