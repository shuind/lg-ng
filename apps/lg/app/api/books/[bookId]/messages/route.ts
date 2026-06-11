import { withAuthRoute } from "@/lib/server/auth-route"
import { NextResponse } from "next/server"
import {
  ChatRequestError,
  getDefaultThreadMessages,
  sendThreadMessage,
} from "@/lib/server/chat-service"

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    return NextResponse.json(await getDefaultThreadMessages(bookId))
  } catch (err) {
    console.error("[api/books/messages] GET error:", err)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const result = await sendThreadMessage(bookId, await request.json())
    return NextResponse.json(result.payload, { status: result.status })
  } catch (err) {
    if (err instanceof ChatRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error("[api/books/messages] error:", err)
    return NextResponse.json({ error: "处理失败" }, { status: 500 })
  }
}

export const GET = withAuthRoute(GETHandler)
export const POST = withAuthRoute(POSTHandler)
