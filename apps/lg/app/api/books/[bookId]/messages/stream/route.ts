import { withAuthRoute } from "@/lib/server/auth-route"
import { ChatRequestError, createThreadMessageStream } from "@/lib/server/chat-service"

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const stream = createThreadMessageStream(bookId, await request.json(), request.signal)
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    if (err instanceof ChatRequestError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error("[api/books/messages/stream] error:", err)
    return Response.json({ error: "处理失败" }, { status: 500 })
  }
}

export const POST = withAuthRoute(POSTHandler)
