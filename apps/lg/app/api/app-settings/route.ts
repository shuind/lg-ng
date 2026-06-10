import { NextResponse } from "next/server"
import { getAppSettings, saveAppSettings } from "@/lib/server/app-settings-store"

export async function GET() {
  try {
    return NextResponse.json(await getAppSettings())
  } catch (err) {
    console.error("[api/app-settings] GET error:", err)
    return NextResponse.json({ error: "读取设置失败" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    return NextResponse.json(await saveAppSettings({ modelId: body.modelId }))
  } catch (err) {
    console.error("[api/app-settings] PATCH error:", err)
    const message = err instanceof Error && err.message === "unsupported model"
      ? "不支持的模型"
      : "保存设置失败"
    const status = message === "不支持的模型" ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
