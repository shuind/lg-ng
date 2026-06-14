import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { runSkillExperiment } from "@/lib/server/skill-trial-service"
import { SkillNotFoundError, SkillValidationError } from "@/lib/server/skill-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const result = await runSkillExperiment(bookId, {
      entry: body?.entry,
      mode: body?.mode,
      instruction: typeof body?.instruction === "string" ? body.instruction : "",
      baselineInstruction: typeof body?.baselineInstruction === "string" ? body.baselineInstruction : undefined,
      sampleText: typeof body?.sampleText === "string" ? body.sampleText : "",
      sampleSource: body?.sampleSource,
      targetSkillName: typeof body?.targetSkillName === "string" ? body.targetSkillName : undefined,
    })
    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof SkillNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof SkillValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[api/books/skills/lab/experiment] error:", error)
    const message = error instanceof Error ? error.message : "试验台 A/B 运行失败。"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
