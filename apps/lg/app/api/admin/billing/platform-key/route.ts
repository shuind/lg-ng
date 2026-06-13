import { NextResponse } from "next/server"
import { createChatCompletion, createOpenAICompatibleClient } from "novel-guide"
import { DEFAULT_APP_MODEL_ID } from "@/lib/app-settings"
import { withAdminRoute } from "@/lib/server/auth-route"
import {
  clearPlatformBillingApiKey,
  getBillingPlatformKeyStatus,
  getPlatformBillingApiKey,
  savePlatformBillingApiKey,
} from "@/lib/server/billing-store"

function getPlatformTestModel(): string {
  return process.env.NG_MODEL ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_APP_MODEL_ID
}

async function testDeepSeekKey(apiKey: string): Promise<{ ok: true; model: string }> {
  const model = getPlatformTestModel()
  await createChatCompletion({
    client: createOpenAICompatibleClient({
      apiKey,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model,
    }),
    model,
    messages: [
      { role: "user", content: "Reply with OK only." },
    ],
    temperature: 0,
    maxTokens: 8,
    timeoutMs: 20000,
  })
  return { ok: true, model }
}

export const GET = withAdminRoute(async () => {
  return NextResponse.json(getBillingPlatformKeyStatus())
})

export const PUT = withAdminRoute(async (request: Request) => {
  try {
    const rawBody = await request.json().catch(() => ({}))
    const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {}
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : ""
    return NextResponse.json(await savePlatformBillingApiKey(apiKey))
  } catch (error) {
    const message = error instanceof Error && error.message === "missing_api_key"
      ? "请输入平台 API Key"
      : "Platform API Key 保存失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
})

export const POST = withAdminRoute(async (request: Request) => {
  try {
    const rawBody = await request.json().catch(() => ({}))
    const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {}
    const candidateKey = typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : getPlatformBillingApiKey()
    if (!candidateKey) {
      return NextResponse.json({ error: "Platform API Key 未配置" }, { status: 400 })
    }
    return NextResponse.json(await testDeepSeekKey(candidateKey))
  } catch (error) {
    console.error("[api/admin/billing/platform-key] test error:", error)
    return NextResponse.json({ error: "Platform API Key 测试失败" }, { status: 400 })
  }
})

export const DELETE = withAdminRoute(async () => {
  return NextResponse.json(await clearPlatformBillingApiKey())
})
