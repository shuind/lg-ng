import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import {
  deleteClaudeSkill,
  readClaudeSkillDraft,
  SkillConflictError,
  SkillNotFoundError,
  SkillValidationError,
  updateClaudeSkill,
} from "@/lib/server/skill-service"

async function GETHandler(
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

async function PUTHandler(
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

async function DELETEHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; skillName: string }> },
) {
  try {
    const { bookId, skillName } = await params
    await deleteClaudeSkill(bookId, decodeURIComponent(skillName))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SkillNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof SkillValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    console.error("[api/books/skills/:skillName] delete error:", err)
    return NextResponse.json({ error: "删除 Skill 失败。" }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
export const PUT = withAuthRoute(PUTHandler)
export const DELETE = withAuthRoute(DELETEHandler)
