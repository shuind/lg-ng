import fs from "fs/promises"
import crypto from "node:crypto"
import path from "path"
import { createTwoFilesPatch, diffLines } from "diff"
import type { ChangeProposal, LedgerEntry, ProposalHunk, ProposalSource, ProposalSummary } from "@/lib/types"
import { appendLedgerEntry } from "@/lib/server/ledger"
import { markDirty } from "@/lib/server/dirty-index"
import { touchBookUpdatedAt } from "@/lib/server/book-store"
import { updateIndexedFile } from "@/lib/server/book-index"
import { withBookMutationQueue } from "@/lib/server/book-mutation-queue"
import { appendJsonlFile, readJsonlFile, writeJsonlFile } from "@/lib/server/jsonl"
import { getBookDir } from "@/lib/server/paths"
import { resolveInsideBook } from "@/lib/server/safe-paths"

const PROPOSALS_FILE = "proposals.jsonl"

export class ProposalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

export interface CreateProposalInput {
  targetPath: string
  baseContent: string
  afterContent: string
  summary?: string
  source?: ProposalSource
}

function proposalsPath(bookId: string): string {
  return path.join(getBookDir(bookId), PROPOSALS_FILE)
}

function nowIso(): string {
  return new Date().toISOString()
}

function sha256(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`
}

function splitLines(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

function lineCount(content: string): number {
  return splitLines(content).length
}

function previewHunk(baseLineCount: number, replacementText: string): string {
  const compact = replacementText.replace(/\s+/g, " ").trim()
  if (compact) return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact
  return `删除 ${baseLineCount} 行`
}

function buildHunks(baseContent: string, afterContent: string): ProposalHunk[] {
  const parts = diffLines(baseContent, afterContent)
  const hunks: ProposalHunk[] = []
  let baseLine = 0
  let index = 0

  while (index < parts.length) {
    const part = parts[index]
    if (!part.added && !part.removed) {
      baseLine += lineCount(part.value)
      index += 1
      continue
    }

    const startLine = baseLine + 1
    let baseLineCount = 0
    let replacementText = ""
    while (index < parts.length && (parts[index].added || parts[index].removed)) {
      const current = parts[index]
      if (current.removed) {
        const count = lineCount(current.value)
        baseLineCount += count
        baseLine += count
      } else if (current.added) {
        replacementText += current.value
      }
      index += 1
    }

    hunks.push({
      id: `h-${hunks.length + 1}`,
      baseStartLine: startLine,
      baseLineCount,
      replacementText,
      preview: previewHunk(baseLineCount, replacementText),
    })
  }

  return hunks
}

function proposalSummary(proposal: ChangeProposal): ProposalSummary {
  return {
    id: proposal.id,
    targetPath: proposal.targetPath,
    source: proposal.source,
    status: proposal.status,
    summary: proposal.summary,
    diffPatch: proposal.diffPatch,
    hunks: proposal.hunks,
  }
}

function composeSelectedHunks(baseContent: string, hunks: ProposalHunk[], selectedIds: Set<string>): string {
  const baseLines = splitLines(baseContent)
  const sorted = [...hunks].sort((a, b) => a.baseStartLine - b.baseStartLine)
  const output: string[] = []
  let cursor = 0

  for (const hunk of sorted) {
    const start = Math.max(0, hunk.baseStartLine - 1)
    const end = Math.max(start, start + hunk.baseLineCount)
    output.push(...baseLines.slice(cursor, start))
    if (selectedIds.has(hunk.id)) {
      output.push(...splitLines(hunk.replacementText))
    } else {
      output.push(...baseLines.slice(start, end))
    }
    cursor = end
  }

  output.push(...baseLines.slice(cursor))
  return output.join("")
}

async function readAllProposals(bookId: string): Promise<ChangeProposal[]> {
  return readJsonlFile<ChangeProposal>(proposalsPath(bookId))
}

async function writeAllProposals(bookId: string, proposals: ChangeProposal[]): Promise<void> {
  await writeJsonlFile(proposalsPath(bookId), proposals)
}

export async function createProposal(bookId: string, input: CreateProposalInput): Promise<ChangeProposal> {
  const ts = nowIso()
  const targetPath = input.targetPath.replace(/\\/g, "/").replace(/^\.\/+/, "")
  const proposal: ChangeProposal = {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    targetPath,
    source: input.source ?? "chat",
    status: "pending",
    summary: input.summary?.trim() || `Proposal for ${targetPath}`,
    baseHash: sha256(input.baseContent),
    baseContent: input.baseContent,
    afterContent: input.afterContent,
    diffPatch: createTwoFilesPatch(targetPath, targetPath, input.baseContent, input.afterContent),
    hunks: buildHunks(input.baseContent, input.afterContent),
    createdAt: ts,
    updatedAt: ts,
  }
  await appendJsonlFile(proposalsPath(bookId), [proposal])
  return proposal
}

export async function createProposals(bookId: string, inputs: CreateProposalInput[]): Promise<ChangeProposal[]> {
  const proposals: ChangeProposal[] = []
  for (const input of inputs) {
    proposals.push(await createProposal(bookId, input))
  }
  return proposals
}

export async function listProposals(bookId: string): Promise<ChangeProposal[]> {
  return readAllProposals(bookId)
}

export async function getProposal(bookId: string, proposalId: string): Promise<ChangeProposal | null> {
  const proposals = await readAllProposals(bookId)
  return proposals.find((proposal) => proposal.id === proposalId) ?? null
}

export async function applyProposal(
  bookId: string,
  proposalId: string,
  hunkIds?: string[],
): Promise<{ proposal: ChangeProposal; ledgerEntry: LedgerEntry; updatedContent: string }> {
  return withBookMutationQueue(bookId, () => applyProposalUnlocked(bookId, proposalId, hunkIds))
}

async function applyProposalUnlocked(
  bookId: string,
  proposalId: string,
  hunkIds?: string[],
): Promise<{ proposal: ChangeProposal; ledgerEntry: LedgerEntry; updatedContent: string }> {
  const proposals = await readAllProposals(bookId)
  const index = proposals.findIndex((proposal) => proposal.id === proposalId)
  if (index < 0) throw new ProposalError("proposal not found", 404, "not_found")

  const proposal = proposals[index]
  if (proposal.status !== "pending") {
    throw new ProposalError("proposal is no longer pending", 409, "not_pending")
  }

  const target = resolveInsideBook(bookId, proposal.targetPath)
  if (!target) throw new ProposalError("invalid target path", 400, "invalid_path")

  let currentContent = ""
  try {
    currentContent = await fs.readFile(target, "utf-8")
  } catch {
    currentContent = ""
  }
  if (sha256(currentContent) !== proposal.baseHash) {
    throw new ProposalError("target file changed since proposal was created", 409, "stale_proposal")
  }

  const selectedIds = hunkIds === undefined
    ? new Set(proposal.hunks.map((hunk) => hunk.id))
    : new Set(hunkIds)
  if (selectedIds.size === 0) {
    throw new ProposalError("no hunks selected", 400, "empty_selection")
  }
  const knownIds = new Set(proposal.hunks.map((hunk) => hunk.id))
  for (const id of selectedIds) {
    if (!knownIds.has(id)) throw new ProposalError(`unknown hunk: ${id}`, 400, "unknown_hunk")
  }

  const updatedContent = hunkIds === undefined
    ? proposal.afterContent
    : composeSelectedHunks(proposal.baseContent, proposal.hunks, selectedIds)

  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, updatedContent, "utf-8")
  const ledgerEntry = await appendLedgerEntry(bookId, {
    actor: "user",
    action: "apply_proposal",
    targetPath: proposal.targetPath,
    beforeSnapshot: currentContent,
    afterSnapshot: updatedContent,
    summary: `Apply proposal ${proposal.summary}`,
  })
  await markDirty(bookId, proposal.targetPath).catch(() => {})
  await touchBookUpdatedAt(bookId)
  await updateIndexedFile(bookId, proposal.targetPath, updatedContent).catch(() => {})

  const appliedAll = selectedIds.size === proposal.hunks.length
  const updatedProposal: ChangeProposal = {
    ...proposal,
    status: appliedAll ? "applied" : "partially_applied",
    appliedHunkIds: [...selectedIds],
    ledgerEntryId: ledgerEntry.id,
    updatedAt: nowIso(),
  }
  proposals[index] = updatedProposal
  await writeAllProposals(bookId, proposals)
  return { proposal: updatedProposal, ledgerEntry, updatedContent }
}

export async function discardProposal(bookId: string, proposalId: string): Promise<ChangeProposal> {
  return withBookMutationQueue(bookId, async () => {
    const proposals = await readAllProposals(bookId)
    const index = proposals.findIndex((proposal) => proposal.id === proposalId)
    if (index < 0) throw new ProposalError("proposal not found", 404, "not_found")
    const proposal = proposals[index]
    if (proposal.status !== "pending") {
      throw new ProposalError("proposal is no longer pending", 409, "not_pending")
    }
    const updated = { ...proposal, status: "discarded" as const, updatedAt: nowIso() }
    proposals[index] = updated
    await writeAllProposals(bookId, proposals)
    return updated
  })
}

export function summarizeProposals(proposals: ChangeProposal[]): ProposalSummary[] {
  return proposals.map(proposalSummary)
}
