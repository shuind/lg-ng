import type { ResponseConstraint } from "../types"

export const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

export type ResponseConstraintStorePayload = {
  constraints: ResponseConstraint[]
  threadEnabled: Record<string, string[]>
  updatedAt: string
}

export const fallbackResponseConstraints: ResponseConstraint[] = [
  {
    id: "default-no-unsolicited-advice",
    title: "不主动追加写作建议",
    instruction: "除非用户明确要求，不要在回复末尾主动追加写作建议、下一步建议或可选方案。",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "default-natural-restraint",
    title: "自然克制语气",
    instruction: "保持自然、克制、贴近对话的语气，不夸张、不卖弄、不使用过度热情的套话。",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "default-no-fixed-ending-question",
    title: "不用固定结尾问句",
    instruction: "不要用固定模板式结尾问句收尾，例如“要不要我继续……”。需要收束时直接收束。",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

export function normalizeResponseConstraintStore(data: unknown): ResponseConstraintStorePayload {
  const raw = data && typeof data === "object" ? data as Partial<ResponseConstraintStorePayload> : {}
  return {
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    threadEnabled: raw.threadEnabled && typeof raw.threadEnabled === "object" ? raw.threadEnabled : {},
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  }
}

export function relativeTime(iso: string): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "昨日"
  return `${days}d`
}

export async function readJsonResponse<T = unknown>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "接口请求失败"
    throw new Error(message)
  }
  return data as T
}

// === 书籍 ===
