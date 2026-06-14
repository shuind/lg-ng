import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { saveSkillExperiment, SkillLabInputError } from "@/lib/server/skill-lab-service"
import { SkillConflictError, SkillValidationError } from "@/lib/server/skill-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    return NextResponse.json(await saveSkillExperiment(bookId, {
      nameHint: typeof body?.nameHint === "string" ? body.nameHint : "",
      title: typeof body?.title === "string" ? body.title : undefined,
      instruction: typeof body?.instruction === "string" ? body.instruction : "",
      sampleText: typeof body?.sampleText === "string" ? body.sampleText : undefined,
      sourceSuggestionId: typeof body?.sourceSuggestionId === "string" ? body.sourceSuggestionId : undefined,
      originExperimentId: typeof body?.originExperimentId === "string" ? body.originExperimentId : undefined,
    }))
  } catch (error) {
    if (error instanceof SkillLabInputError || error instanceof SkillConflictError || error instanceof SkillValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[api/books/skills/lab/experiment/save] error:", error)
    const message = error instanceof Error ? error.message : "保存实验 Skill 失败。"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
