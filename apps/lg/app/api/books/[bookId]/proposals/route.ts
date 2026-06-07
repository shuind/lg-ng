import { NextResponse } from "next/server"
import { createProposal, listProposals, ProposalError, summarizeProposals } from "@/lib/server/proposal-service"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const proposals = await listProposals(bookId)
    return NextResponse.json({ proposals: summarizeProposals(proposals) })
  } catch (err) {
    console.error("[api/books/proposals] list error:", err)
    return NextResponse.json({ proposals: [] })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json().catch(() => ({}))
    if (
      typeof body.targetPath !== "string" ||
      typeof body.baseContent !== "string" ||
      typeof body.afterContent !== "string"
    ) {
      return NextResponse.json({ error: "缺少 proposal 内容" }, { status: 400 })
    }
    const proposal = await createProposal(bookId, {
      targetPath: body.targetPath,
      baseContent: body.baseContent,
      afterContent: body.afterContent,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      source: body.source === "draft" || body.source === "workflow" ? body.source : "chat",
    })
    return NextResponse.json({ proposal: summarizeProposals([proposal])[0] })
  } catch (err) {
    if (err instanceof ProposalError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error("[api/books/proposals] create error:", err)
    return NextResponse.json({ error: "创建 proposal 失败" }, { status: 500 })
  }
}
