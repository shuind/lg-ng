import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { applyProposal, ProposalError, summarizeProposals } from "@/lib/server/proposal-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string; proposalId: string }> },
) {
  try {
    const { bookId, proposalId } = await params
    const body = await request.json().catch(() => ({}))
    const hunkIds = Array.isArray(body.hunkIds)
      ? body.hunkIds.filter((item: unknown): item is string => typeof item === "string")
      : undefined
    const result = await applyProposal(bookId, proposalId, hunkIds)
    return NextResponse.json({
      proposal: summarizeProposals([result.proposal])[0],
      ledgerEntry: result.ledgerEntry,
      updatedContent: result.updatedContent,
    })
  } catch (err) {
    if (err instanceof ProposalError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error("[api/books/proposals/apply] error:", err)
    return NextResponse.json({ error: "采纳 proposal 失败" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
