import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createBook, readBookFile, writeBookFile } from "@/lib/server/book-store"
import { getDirtyFiles } from "@/lib/server/dirty-index"
import { getBookDir } from "@/lib/server/paths"
import { retrieveContext } from "@/lib/server/retrieval"
import { updateIndexedFile } from "@/lib/server/book-index"
import { appendLedgerEntry, listLedgerEntries, rollbackLedgerEntry } from "@/lib/server/ledger"

async function main() {
  process.env.LG_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "lg-ng-optimization-"))

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

  console.log(JSON.stringify({
    bookId: book.id,
    dataRoot: process.env.LG_DATA_DIR,
    aliasHit: retrieved[0]?.path ?? null,
    canonAliasHit: canonRetrieved[0]?.path ?? null,
    rollbackEntryId: agentEntry.id,
    restored: await readFile(absChapterPath, "utf-8"),
  }, null, 2))
}

main().catch((error) => {
  console.error("Optimization smoke failed:", error)
  process.exit(1)
})
