import { NextResponse } from "next/server"
import {
  createResponseConstraint,
  deleteResponseConstraint,
  getResponseConstraintStore,
  setThreadResponseConstraintIds,
  updateResponseConstraint,
} from "@/lib/server/response-constraint-store"

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function parseEnabledIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    return NextResponse.json(await getResponseConstraintStore(bookId))
  } catch (err) {
    console.error("[api/books/response-constraints] GET error:", err)
    return NextResponse.json({ error: "读取回复约束失败" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const title = cleanText(body.title)
    const instruction = cleanText(body.instruction)
    if (!title || !instruction) {
      return NextResponse.json({ error: "缺少 title 或 instruction" }, { status: 400 })
    }
    return NextResponse.json(await createResponseConstraint(bookId, { title, instruction }))
  } catch (err) {
    console.error("[api/books/response-constraints] POST error:", err)
    return NextResponse.json({ error: "创建回复约束失败" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const threadId = cleanText(body.threadId)
    if (threadId) {
      return NextResponse.json(await setThreadResponseConstraintIds(bookId, threadId, parseEnabledIds(body.enabledIds)))
    }

    const id = cleanText(body.id)
    const title = cleanText(body.title)
    const instruction = cleanText(body.instruction)
    if (!id || !title || !instruction) {
      return NextResponse.json({ error: "缺少 id、title 或 instruction" }, { status: 400 })
    }
    return NextResponse.json(await updateResponseConstraint(bookId, id, { title, instruction }))
  } catch (err) {
    console.error("[api/books/response-constraints] PATCH error:", err)
    return NextResponse.json({ error: "更新回复约束失败" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const id = new URL(request.url).searchParams.get("id")?.trim()
    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 })
    }
    return NextResponse.json(await deleteResponseConstraint(bookId, id))
  } catch (err) {
    console.error("[api/books/response-constraints] DELETE error:", err)
    return NextResponse.json({ error: "删除回复约束失败" }, { status: 500 })
  }
}
