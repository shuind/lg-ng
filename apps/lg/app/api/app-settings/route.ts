import { NextResponse } from "next/server"
import { getAppSettings, saveAppSettings } from "@/lib/server/app-settings-store"
import { withAuthRoute } from "@/lib/server/auth-route"

async function GETHandler() {
  try {
    return NextResponse.json(await getAppSettings())
  } catch (err) {
    console.error("[api/app-settings] GET error:", err)
    return NextResponse.json({ error: "读取设置失败" }, { status: 500 })
  }
}

async function PATCHHandler(request: Request) {
  try {
    const body = await request.json()
    return NextResponse.json(await saveAppSettings({
      provider: body.provider,
      modelId: body.modelId,
      paymentSource: body.paymentSource,
      platformProviderId: body.platformProviderId,
      providerApiKey: body.providerApiKey,
      providerBaseUrl: body.providerBaseUrl,
      clearProviderApiKey: body.clearProviderApiKey,
      deepSeekApiKey: body.deepSeekApiKey,
      clearDeepSeekApiKey: body.clearDeepSeekApiKey,
      customProviderId: body.customProviderId,
      customProviderLabel: body.customProviderLabel,
      customProviderBaseUrl: body.customProviderBaseUrl,
      customProviderModelId: body.customProviderModelId,
      customProviderApiKey: body.customProviderApiKey,
      deleteCustomProviderId: body.deleteCustomProviderId,
    }))
  } catch (err) {
    console.error("[api/app-settings] PATCH error:", err)
    const badRequest = err instanceof Error &&
      (err.message === "unsupported provider" ||
        err.message === "unsupported model" ||
        err.message === "unsupported payment source" ||
        err.message === "unsupported platform provider" ||
        err.message === "invalid custom provider")
    const message = badRequest ? "保存的设置无效" : "保存设置失败"
    const status = badRequest ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export const GET = withAuthRoute(GETHandler)
export const PATCH = withAuthRoute(PATCHHandler)
