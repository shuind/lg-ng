import { NextResponse } from "next/server"
import { getRelationshipGraph } from "@/lib/server/relationship-graph"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const graph = await getRelationshipGraph(bookId)
    return NextResponse.json(graph)
  } catch (err) {
    console.error("[api/books/graph] error:", err)
    return NextResponse.json({ nodes: [], edges: [] }, { status: 200 })
  }
}
