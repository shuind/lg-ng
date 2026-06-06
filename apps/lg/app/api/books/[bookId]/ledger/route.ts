import { NextResponse } from "next/server"
import { listLedgerEntries } from "@/lib/server/ledger"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const entries = await listLedgerEntries(bookId)
    return NextResponse.json(entries)
  } catch (err) {
    console.error("[api/books/ledger] error:", err)
    return NextResponse.json([], { status: 200 })
  }
}
