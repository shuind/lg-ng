import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { runSkillTrial } from "@/lib/server/skill-trial-service"
import { SkillNotFoundError, SkillValidationError } from "@/lib/server/skill-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const trial = await runSkillTrial(bookId, {
      skillName: typeof body?.skillName === "string" ? body.skillName : "",
      sampleText: typeof body?.sampleText === "string" ? body.sampleText : "",
      sampleSource: body?.sampleSource,
    })
    return NextResponse.json({ trial })
  } catch (error) {
    if (error instanceof SkillNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof SkillValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[api/books/skills/lab/trial] error:", error)
    const message = error instanceof Error ? error.message : "A/B 探针运行失败。"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
