import { NextResponse } from "next/server"
import { withAuthRoute } from "@/lib/server/auth-route"
import { testAppSettingsLlm } from "@/lib/server/app-settings-store"

async function POSTHandler() {
  try {
    return NextResponse.json(await testAppSettingsLlm())
  } catch (err) {
    console.error("[api/app-settings/test-llm] error:", err)
    const message = err instanceof Error && err.message === "provider api key missing"
      ? "请先保存当前供应商的 API Key"
      : "模型连通性测试失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const POST = withAuthRoute(POSTHandler)
