import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { draftWorkspaceSkill } from "@/lib/server/skill-draft-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    await params
    const body = await request.json()
    const draft = await draftWorkspaceSkill(body)
    return NextResponse.json(draft)
  } catch (err) {
    console.error("[api/books/skills/draft] error:", err)
    return NextResponse.json({ error: "生成 Skill 草稿失败。" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
