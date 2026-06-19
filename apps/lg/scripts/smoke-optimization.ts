import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sendMessageStream } from "@/lib/api/chat"
import { createBook, readBookFile, writeBookFile } from "@/lib/server/book-store"
import { withBookMutationQueue } from "@/lib/server/book-mutation-queue"
import { getDirtyFiles } from "@/lib/server/dirty-index"
import { getBookDir } from "@/lib/server/paths"
import { retrieveContext } from "@/lib/server/retrieval"
import { searchIndexedTerms, updateIndexedFile } from "@/lib/server/book-index"
import { appendLedgerEntry, listLedgerEntries, rollbackLedgerEntry } from "@/lib/server/ledger"
import { applyProposal, createProposal, discardProposal } from "@/lib/server/proposal-service"

async function main() {
  process.env.LG_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "lg-ng-optimization-"))
  process.env.DEEPSEEK_API_KEY = ""

  const book = await createBook("Optimization Smoke")
  await writeBookFile(
    book.id,
    "人物设定/顾慎.md",
    [
      "# 顾慎",
      "",
      "aliases: 欺天者、瞒天客",
      "",
      "身负瞒天佩，正在追查岁轮印记。",
    ].join("\n"),
  )

  const retrieved = await retrieveContext(book.id, "欺天者现在在哪")
  if (!retrieved.some((item) => item.path === "人物设定/顾慎.md")) {
    throw new Error("alias retrieval did not return the aliased setting card")
  }

  await writeBookFile(
    book.id,
    "canon/settings/天轮.md",
    [
      "# 天轮",
      "",
      "别名：岁轮、百年劫",
      "",
      "修仙界时间规律的具象化。",
    ].join("\n"),
  )
  const canonRetrieved = await retrieveContext(book.id, "百年劫是什么")
  if (!canonRetrieved.some((item) => item.path === "canon/settings/天轮.md")) {
    throw new Error("alias retrieval did not return the canon setting entity")
  }
  const bodyRetrieved = await retrieveContext(book.id, "修仙界时间规律")
  if (!bodyRetrieved.some((item) => item.path === "canon/settings/天轮.md")) {
    throw new Error("term-index retrieval did not return the body keyword match")
  }
  const termHits = await searchIndexedTerms(book.id, ["修仙界时间"])
  if (!termHits.some((item) => item.path === "canon/settings/天轮.md")) {
    throw new Error("term-index did not store the body keyword match")
  }

  const chapterPath = "章节正文/第一章.md"
  await writeBookFile(book.id, chapterPath, "旧内容")
  const absChapterPath = path.join(getBookDir(book.id), ...chapterPath.split("/"))
  await mkdir(path.dirname(absChapterPath), { recursive: true })
  await writeFile(absChapterPath, "新内容", "utf-8")
  await appendLedgerEntry(book.id, {
    actor: "agent",
    action: "write_file",
    targetPath: chapterPath,
    beforeSnapshot: "旧内容",
    afterSnapshot: "新内容",
    summary: `AI 写入 ${chapterPath}`,
  })
  await updateIndexedFile(book.id, chapterPath, "新内容")

  const ledger = await listLedgerEntries(book.id, { limit: 10 })
  const agentEntry = ledger.entries.find((entry) =>
    entry.actor === "agent" &&
    entry.targetPath === chapterPath &&
    entry.action === "write_file"
  )
  if (!agentEntry) throw new Error("agent ledger entry was not created")

  const rollback = await rollbackLedgerEntry(book.id, agentEntry.id)
  if (!rollback.success) throw new Error(rollback.error ?? "rollback failed")

  const restored = await readBookFile(book.id, chapterPath)
  if (restored !== "旧内容") {
    throw new Error(`rollback restored unexpected content: ${JSON.stringify(restored)}`)
  }

  const dirty = await getDirtyFiles(book.id)
  if (!dirty.some((entry) => entry.path === chapterPath)) {
    throw new Error("rollback did not mark the file dirty")
  }

  const proposalPath = "章节正文/第二章.md"
  await writeBookFile(book.id, proposalPath, "one\ntwo\nthree\nfour\n")
  const proposal = await createProposal(book.id, {
    targetPath: proposalPath,
    baseContent: "one\ntwo\nthree\nfour\n",
    afterContent: "ONE\ntwo\nTHREE\nfour\n",
    summary: "revise selected lines",
    source: "workflow",
  })
  const partial = await applyProposal(book.id, proposal.id, ["h-1"])
  if (partial.updatedContent !== "ONE\ntwo\nthree\nfour\n") {
    throw new Error(`selected hunk apply produced unexpected content: ${JSON.stringify(partial.updatedContent)}`)
  }
  if (partial.proposal.status !== "partially_applied") {
    throw new Error(`partial proposal status was ${partial.proposal.status}`)
  }
  const appliedLedger = await listLedgerEntries(book.id, { limit: 10 })
  if (!appliedLedger.entries.some((entry) => entry.id === partial.ledgerEntry.id)) {
    throw new Error("proposal apply did not create a ledger entry")
  }

  const allProposalPath = "章节正文/第三章.md"
  await writeBookFile(book.id, allProposalPath, "alpha\nbeta\n")
  const allProposal = await createProposal(book.id, {
    targetPath: allProposalPath,
    baseContent: "alpha\nbeta\n",
    afterContent: "alpha\nBETA\n",
    source: "draft",
  })
  const allApplied = await applyProposal(book.id, allProposal.id)
  if (allApplied.updatedContent !== "alpha\nBETA\n" || allApplied.proposal.status !== "applied") {
    throw new Error("apply all hunks failed")
  }

  const stalePath = "章节正文/第四章.md"
  await writeBookFile(book.id, stalePath, "base\n")
  const staleProposal = await createProposal(book.id, {
    targetPath: stalePath,
    baseContent: "base\n",
    afterContent: "next\n",
  })
  await writeBookFile(book.id, stalePath, "external\n")
  let staleRejected = false
  try {
    await applyProposal(book.id, staleProposal.id)
  } catch (error) {
    staleRejected = error instanceof Error && error.message.includes("目标文件已在提案创建后发生变化")
  }
  if (!staleRejected) throw new Error("stale proposal was not rejected")

  const discardProposalRecord = await createProposal(book.id, {
    targetPath: stalePath,
    baseContent: "external\n",
    afterContent: "discarded\n",
  })
  const discarded = await discardProposal(book.id, discardProposalRecord.id)
  if (discarded.status !== "discarded") throw new Error("discard did not update proposal status")

  const streamEvents = await collectStreamClientEvents(book.id)
  if (!streamEvents.includes("turn") || !streamEvents.includes("done")) {
    throw new Error(`stream did not emit turn/done events: ${streamEvents.join(",")}`)
  }

  const order: string[] = []
  await Promise.all([
    withBookMutationQueue(book.id, async () => {
      order.push("a-start")
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push("a-end")
    }),
    withBookMutationQueue(book.id, async () => {
      order.push("b-start")
      order.push("b-end")
    }),
  ])
  if (order.join(",") !== "a-start,a-end,b-start,b-end") {
    throw new Error(`book mutation queue did not serialize operations: ${order.join(",")}`)
  }

  console.log(JSON.stringify({
    bookId: book.id,
    dataRoot: process.env.LG_DATA_DIR,
    aliasHit: retrieved[0]?.path ?? null,
    canonAliasHit: canonRetrieved[0]?.path ?? null,
    bodyTermHit: bodyRetrieved[0]?.path ?? null,
    directTermHit: termHits[0]?.path ?? null,
    streamEvents,
    queueOrder: order,
    rollbackEntryId: agentEntry.id,
    partialProposalId: proposal.id,
    allProposalId: allProposal.id,
    restored: await readFile(absChapterPath, "utf-8"),
  }, null, 2))
}

async function collectStreamClientEvents(bookId: string): Promise<string[]> {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  const events: string[] = []
  const body = [
    "event: turn\ndata: {}\n\n",
    "event: agent_event\ndata: {}\n\n",
    "event: assistant_message\ndata: {}\n\n",
    "event: done\ndata: {}\n\n",
  ].join("")

  globalThis.fetch = (async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (!url.endsWith(`/api/books/${bookId}/messages/stream`)) {
      throw new Error(`unexpected stream URL: ${url}`)
    }
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })
  }) as typeof fetch

  try {
    await sendMessageStream(bookId, "synthetic stream smoke", undefined, [], {}, {
      onTurn: () => events.push("turn"),
      onAgentEvent: () => events.push("agent_event"),
      onAssistantMessage: () => events.push("assistant_message"),
      onDone: () => events.push("done"),
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  return events
}

main().catch((error) => {
  console.error("Optimization smoke failed:", error)
  process.exit(1)
})
