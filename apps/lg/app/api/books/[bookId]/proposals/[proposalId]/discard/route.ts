import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { discardProposal, ProposalError, summarizeProposals } from "@/lib/server/proposal-service"

async function POSTHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; proposalId: string }> },
) {
  try {
    const { bookId, proposalId } = await params
    const proposal = await discardProposal(bookId, proposalId)
    return NextResponse.json({ proposal: summarizeProposals([proposal])[0] })
  } catch (err) {
    if (err instanceof ProposalError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error("[api/books/proposals/discard] error:", err)
    return NextResponse.json({ error: "丢弃 proposal 失败" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
