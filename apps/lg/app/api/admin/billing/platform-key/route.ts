import { NextResponse } from "next/server"
import { createChatCompletion, createOpenAICompatibleClient } from "novel-guide"
import { withAdminRoute } from "@/lib/server/auth-route"
import {
  deletePlatformBillingProvider,
  getBillingPlatformKeyStatus,
  getPlatformBillingConfig,
  getPlatformBillingConfigById,
  savePlatformBillingProvider,
} from "@/lib/server/billing-store"

function readBodyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function testPlatformProvider(input: {
  id?: unknown
  label?: unknown
  provider?: unknown
  baseUrl?: unknown
  modelId?: unknown
  apiKey?: unknown
}): Promise<{ ok: true; model: string; provider: string }> {
  const requestedId = stringOrEmpty(input.id)
  const apiKeyDraft = stringOrEmpty(input.apiKey)
  const hasDraftConfig = Boolean(
    stringOrEmpty(input.label) ||
    stringOrEmpty(input.provider) ||
    stringOrEmpty(input.baseUrl) ||
    stringOrEmpty(input.modelId)
  )
  if (!requestedId && hasDraftConfig && !apiKeyDraft) throw new Error("missing_platform_config")

  const current = requestedId ? getPlatformBillingConfigById(requestedId) : getPlatformBillingConfig()
  const provider = stringOrEmpty(input.provider) || current?.provider || "deepseek"
  const apiKey = apiKeyDraft || current?.apiKey || ""
  const baseUrl = stringOrEmpty(input.baseUrl) || current?.baseUrl || ""
  const model = stringOrEmpty(input.modelId) || current?.model || ""
  if (!apiKey || !baseUrl || !model) throw new Error("missing_platform_config")

  await createChatCompletion({
    client: createOpenAICompatibleClient({
      provider,
      apiKey,
      baseUrl,
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
  return { ok: true, model, provider }
}

export const GET = withAdminRoute(async () => {
  return NextResponse.json(getBillingPlatformKeyStatus())
})

export const PUT = withAdminRoute(async (request: Request) => {
  try {
    const body = readBodyRecord(await request.json().catch(() => ({})))
    return NextResponse.json(await savePlatformBillingProvider({
      id: body.id,
      label: body.label,
      provider: body.provider,
      baseUrl: body.baseUrl,
      modelId: body.modelId,
      apiKey: body.apiKey,
      setActive: body.setActive,
    }))
  } catch (error) {
    const message = error instanceof Error && error.message === "missing_api_key"
      ? "新增平台配置需要 API Key"
      : error instanceof Error && error.message === "invalid_platform_provider"
        ? "请填写平台名称、供应商、接口地址和模型 ID"
        : "平台模型配置保存失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
})

export const POST = withAdminRoute(async (request: Request) => {
  try {
    const body = readBodyRecord(await request.json().catch(() => ({})))
    return NextResponse.json(await testPlatformProvider({
      id: body.id,
      label: body.label,
      provider: body.provider,
      baseUrl: body.baseUrl,
      modelId: body.modelId,
      apiKey: body.apiKey,
    }))
  } catch (error) {
    console.error("[api/admin/billing/platform-key] test error:", error)
    const message = error instanceof Error && error.message === "missing_platform_config"
      ? "平台模型配置不完整"
      : "平台模型配置测试失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
})

export const DELETE = withAdminRoute(async (request: Request) => {
  try {
    const body = readBodyRecord(await request.json().catch(() => ({})))
    return NextResponse.json(await deletePlatformBillingProvider(body.id))
  } catch (error) {
    const message = error instanceof Error && error.message === "missing_platform_provider_id"
      ? "缺少平台配置 ID"
      : "平台模型配置删除失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
