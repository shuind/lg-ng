import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { recordSkillTrialVerdict } from "@/lib/server/skill-trial-service"
import { SkillNotFoundError, SkillValidationError } from "@/lib/server/skill-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string; trialId: string }> },
) {
  try {
    const { bookId, trialId } = await params
    const body = await request.json()
    const trial = await recordSkillTrialVerdict(
      bookId,
      decodeURIComponent(trialId),
      body?.verdict,
      typeof body?.judgeNote === "string" ? body.judgeNote : undefined,
    )
    return NextResponse.json({ trial })
  } catch (error) {
    if (error instanceof SkillNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof SkillValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[api/books/skills/lab/trial/verdict] error:", error)
    return NextResponse.json({ error: "记录 A/B 判定失败。" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
