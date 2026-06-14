import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { analyzeSkillLab, listSkillLab, SkillLabInputError } from "@/lib/server/skill-lab-service"

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    return NextResponse.json(await listSkillLab(bookId))
  } catch (error) {
    console.error("[api/books/skills/lab] error:", error)
    return NextResponse.json(
      { suggestions: [], analyzedAt: "", analyzedRevisionCount: 0, modelConfigured: false },
      { status: 200 },
    )
  }
}

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json().catch(() => ({}))
    return NextResponse.json(await analyzeSkillLab(bookId, {
      ledgerEntryIds: Array.isArray(body?.ledgerEntryIds) ? body.ledgerEntryIds : [],
      focus: typeof body?.focus === "string" ? body.focus : undefined,
    }))
  } catch (error) {
    if (error instanceof SkillLabInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[api/books/skills/lab] analyze error:", error)
    const message = error instanceof Error ? error.message : "分析改稿失败。"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
export const POST = withAuthRoute(POSTHandler)
