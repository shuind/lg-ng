import { listBooks } from "@/lib/server/book-store"
import { rebuildBookIndexes } from "@/lib/server/book-index"
import { listChapters } from "@/lib/server/chapter-store"
import { listSettingCards } from "@/lib/server/setting-card-store"
import { listLedgerEntries } from "@/lib/server/ledger"

async function main() {
  const requestedBookId = process.argv[2]
  const books = await listBooks()
  const bookId = requestedBookId || books[0]?.id

  if (!bookId) {
    throw new Error("No book found. Run `pnpm --filter lg seed` first or pass a book id.")
  }

  await rebuildBookIndexes(bookId)

  const [chapters, cards, ledger] = await Promise.all([
    listChapters(bookId),
    listSettingCards(bookId),
    listLedgerEntries(bookId, { limit: 5 }),
  ])

  console.log(JSON.stringify({
    bookId,
    chapters: chapters.length,
    settingCards: cards.length,
    ledgerEntries: ledger.entries.length,
    hasNextLedgerPage: Boolean(ledger.nextCursor),
    firstChapter: chapters[0]?.path ?? null,
    firstSettingCard: cards[0]?.path ?? null,
  }, null, 2))
}

main().catch((error) => {
  console.error("Smoke failed:", error)
  process.exit(1)
})
