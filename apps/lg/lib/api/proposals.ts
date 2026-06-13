import type { LedgerEntry, ProposalSource, ProposalSummary } from "@/lib/types"

export async function listProposals(bookId: string): Promise<ProposalSummary[]> {
  const res = await fetch(`/api/books/${bookId}/proposals`, { cache: "no-store" })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.proposals) ? data.proposals : []
}

export async function createProposal(bookId: string, input: {
  targetPath: string
  baseContent: string
  afterContent: string
  summary?: string
  source?: ProposalSource
}): Promise<ProposalSummary> {
  const res = await fetch(`/api/books/${bookId}/proposals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "创建改动提案失败")
  return data.proposal
}

export async function applyProposal(bookId: string, proposalId: string, hunkIds?: string[]): Promise<{
  proposal: ProposalSummary
  ledgerEntry: LedgerEntry
  updatedContent: string
}> {
  const res = await fetch(`/api/books/${bookId}/proposals/${encodeURIComponent(proposalId)}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hunkIds }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "采纳改动提案失败")
  return data
}

export async function discardProposal(bookId: string, proposalId: string): Promise<ProposalSummary> {
  const res = await fetch(`/api/books/${bookId}/proposals/${encodeURIComponent(proposalId)}/discard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "丢弃改动提案失败")
  return data.proposal
}
