import { NextResponse } from "next/server"
import { withAdminRoute } from "@/lib/server/auth-route"
import { getApiDebugLogSettings, updateApiDebugLogSettings } from "@/lib/server/api-debug-settings"

function readBodyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export const GET = withAdminRoute(async () => {
  return NextResponse.json(await getApiDebugLogSettings())
})

export const PUT = withAdminRoute(async (request: Request) => {
  try {
    const body = readBodyRecord(await request.json().catch(() => ({})))
    return NextResponse.json(await updateApiDebugLogSettings({
      enabled: body.enabled === true,
    }))
  } catch (error) {
    console.error("[api/admin/debug-log] PUT error:", error)
    return NextResponse.json({ error: "调试日志设置保存失败" }, { status: 500 })
  }
})
