import { NextResponse } from "next/server"
import { rollbackLedgerEntry } from "@/lib/server/ledger"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; entryId: string }> },
) {
  try {
    const { bookId, entryId } = await params
    const result = await rollbackLedgerEntry(bookId, entryId)
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "回滚失败" }, { status: 400 })
    }
    return NextResponse.json({ success: true, updatedAt: result.updatedAt })
  } catch (err) {
    console.error("[api/books/ledger/rollback] error:", err)
    return NextResponse.json({ error: "回滚失败" }, { status: 500 })
  }
}
