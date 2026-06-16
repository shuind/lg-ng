import { NextResponse } from "next/server"
import { withAuthRoute } from "@/lib/server/auth-route"
import {
  createUserMemoryItem,
  deleteUserMemoryItem,
  getUserMemoryPayload,
  setUserMemoryStoreEnabled,
  updateUserMemoryItem,
} from "@/lib/server/user-memory-store"
import type { UserMemoryScope } from "@/lib/types"

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function cleanScope(value: unknown): UserMemoryScope {
  return value === "book" ? "book" : "global"
}

async function GETHandler(request: Request) {
  try {
    const url = new URL(request.url)
    const bookId = url.searchParams.get("bookId")?.trim() || undefined
    const userMessage = url.searchParams.get("q")?.trim() || ""
    return NextResponse.json(await getUserMemoryPayload(bookId, userMessage))
  } catch (err) {
    console.error("[api/user-memory] GET error:", err)
    return NextResponse.json({ error: "读取 memory 失败" }, { status: 500 })
  }
}

async function POSTHandler(request: Request) {
  try {
    const body = await request.json()
    const text = cleanText(body.text)
    if (!text) return NextResponse.json({ error: "缺少 text" }, { status: 400 })
    await createUserMemoryItem({
      text,
      enabled: body.enabled !== false,
      scope: cleanScope(body.scope),
      bookId: cleanText(body.bookId) || undefined,
      tags: cleanTags(body.tags),
    })
    return NextResponse.json(await getUserMemoryPayload(cleanText(body.bookId) || undefined, ""))
  } catch (err) {
    console.error("[api/user-memory] POST error:", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "创建 memory 失败" }, { status: 500 })
  }
}

async function PATCHHandler(request: Request) {
  try {
    const body = await request.json()
    const id = cleanText(body.id)
    const bookId = cleanText(body.bookId) || undefined
    if (!id && typeof body.enabled === "boolean") {
      await setUserMemoryStoreEnabled(body.enabled)
      return NextResponse.json(await getUserMemoryPayload(bookId, ""))
    }
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })

    await updateUserMemoryItem({
      id,
      text: typeof body.text === "string" ? body.text : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      scope: body.scope === "book" || body.scope === "global" ? body.scope : undefined,
      bookId,
      tags: Array.isArray(body.tags) ? cleanTags(body.tags) : undefined,
    })
    return NextResponse.json(await getUserMemoryPayload(bookId, ""))
  } catch (err) {
    console.error("[api/user-memory] PATCH error:", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "更新 memory 失败" }, { status: 500 })
  }
}

async function DELETEHandler(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get("id")?.trim()
    const bookId = url.searchParams.get("bookId")?.trim() || undefined
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
    await deleteUserMemoryItem(id)
    return NextResponse.json(await getUserMemoryPayload(bookId, ""))
  } catch (err) {
    console.error("[api/user-memory] DELETE error:", err)
    return NextResponse.json({ error: "删除 memory 失败" }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
export const POST = withAuthRoute(POSTHandler)
export const PATCH = withAuthRoute(PATCHHandler)
export const DELETE = withAuthRoute(DELETEHandler)
