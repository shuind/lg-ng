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
      modelId: body.modelId,
      deepSeekApiKey: body.deepSeekApiKey,
      clearDeepSeekApiKey: body.clearDeepSeekApiKey,
    }))
  } catch (err) {
    console.error("[api/app-settings] PATCH error:", err)
    const message = err instanceof Error && err.message === "unsupported model"
      ? "不支持的模型"
      : "保存设置失败"
    const status = message === "不支持的模型" ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export const GET = withAuthRoute(GETHandler)
export const PATCH = withAuthRoute(PATCHHandler)
