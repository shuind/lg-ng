"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { getAppSettings, updateAppSettings } from "@/lib/api"
import {
  APP_MODEL_OPTIONS,
  DEFAULT_APP_MODEL_ID,
  type AppModelId,
  type AppSettingsPayload,
} from "@/lib/app-settings"
import { cn } from "@/lib/utils"

export function AppSettingsPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState<AppSettingsPayload | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<AppModelId>(DEFAULT_APP_MODEL_ID)
  const [loading, setLoading] = useState(true)
  const [savingModelId, setSavingModelId] = useState<AppModelId | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getAppSettings()
      .then((payload) => {
        if (cancelled) return
        setSettings(payload)
        setSelectedModelId(payload.modelId)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "读取设置失败")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSelectModel(modelId: AppModelId) {
    if (savingModelId || modelId === selectedModelId) return
    const previousModelId = selectedModelId
    setSelectedModelId(modelId)
    setSavingModelId(modelId)
    setError(null)

    try {
      const payload = await updateAppSettings({ modelId })
      setSettings(payload)
      setSelectedModelId(payload.modelId)
    } catch (err) {
      setSelectedModelId(previousModelId)
      setError(err instanceof Error ? err.message : "保存设置失败")
    } finally {
      setSavingModelId(null)
    }
  }

  return (
    <section className={cn("space-y-5", className)}>
      <div className="space-y-1">
        <h2 className="text-[13px] font-medium text-foreground">模型</h2>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          选择应用默认模型。保存后，后续 AI 请求会使用新的模型配置。
        </p>
      </div>

      <div className="grid gap-2" role="radiogroup" aria-label="模型">
        {APP_MODEL_OPTIONS.map((option) => {
          const active = selectedModelId === option.id
          const saving = savingModelId === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={loading || Boolean(savingModelId)}
              onClick={() => void handleSelectModel(option.id)}
              className={cn(
                "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                active
                  ? "border-primary/55 bg-primary/10 text-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{option.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{option.id}</span>
              </span>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : active ? (
                <Check className="h-4 w-4 text-primary" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="min-h-5 text-[12px] leading-relaxed text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在读取设置...
          </span>
        ) : error ? (
          <span className="text-destructive">{error}</span>
        ) : settings?.deepSeekConfigured ? (
          `当前：${settings.activeModel ?? selectedModelId}`
        ) : (
          "未检测到 DEEPSEEK_API_KEY。模型选择会保存，但发起请求前仍需要配置密钥。"
        )}
      </div>
    </section>
  )
}
