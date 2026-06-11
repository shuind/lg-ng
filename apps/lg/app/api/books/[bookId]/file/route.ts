import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import { readBookFile, writeBookFile, getBookFileMtime } from "@/lib/server/book-store"

async function GETHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get("path")
    if (!filePath) {
      return NextResponse.json({ error: "缺少 path 参数" }, { status: 400 })
    }

    const content = await readBookFile(bookId, filePath)
    if (content === null) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 })
    }

    const mtime = await getBookFileMtime(bookId, filePath)
    return NextResponse.json({ bookId, path: filePath, content, updatedAt: mtime })
  } catch (err) {
    console.error("[api/books/file] read error:", err)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

async function PUTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const { path: filePath, content } = body

    if (!filePath || typeof content !== "string") {
      return NextResponse.json({ error: "缺少 path 或 content" }, { status: 400 })
    }

    const ok = await writeBookFile(bookId, filePath, content)
    if (!ok) {
      return NextResponse.json({ error: "写入失败" }, { status: 500 })
    }

    const mtime = await getBookFileMtime(bookId, filePath)
    return NextResponse.json({ success: true, updatedAt: mtime })
  } catch (err) {
    console.error("[api/books/file] write error:", err)
    return NextResponse.json({ error: "写入失败" }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
export const PUT = withAuthRoute(PUTHandler)
