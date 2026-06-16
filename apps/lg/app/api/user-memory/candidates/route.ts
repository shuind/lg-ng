import { NextResponse } from "next/server"
import { withAuthRoute } from "@/lib/server/auth-route"
import {
  acceptUserMemoryCandidate,
  deleteUserMemoryCandidate,
  getUserMemoryPayload,
  updateUserMemoryCandidate,
} from "@/lib/server/user-memory-store"

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

async function PATCHHandler(request: Request) {
  try {
    const body = await request.json()
    const id = cleanText(body.id)
    const bookId = cleanText(body.bookId) || undefined
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })

    const input = {
      id,
      text: typeof body.text === "string" ? body.text : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      scope: body.scope === "book" || body.scope === "global" ? body.scope : undefined,
      bookId,
      tags: Array.isArray(body.tags) ? cleanTags(body.tags) : undefined,
    }
    if (body.action === "accept") {
      await acceptUserMemoryCandidate(input)
    } else {
      await updateUserMemoryCandidate(input)
    }
    return NextResponse.json(await getUserMemoryPayload(bookId, ""))
  } catch (err) {
    console.error("[api/user-memory/candidates] PATCH error:", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "更新 memory 候选失败" }, { status: 500 })
  }
}

async function DELETEHandler(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get("id")?.trim()
    const bookId = url.searchParams.get("bookId")?.trim() || undefined
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
    await deleteUserMemoryCandidate(id)
    return NextResponse.json(await getUserMemoryPayload(bookId, ""))
  } catch (err) {
    console.error("[api/user-memory/candidates] DELETE error:", err)
    return NextResponse.json({ error: "删除 memory 候选失败" }, { status: 500 })
  }
}

export const PATCH = withAuthRoute(PATCHHandler)
export const DELETE = withAuthRoute(DELETEHandler)
