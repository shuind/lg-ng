"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, LogOut, PlugZap, Save, Trash2 } from "lucide-react"
import { getAppSettings, logout, testAppSettingsLlm, updateAppSettings } from "@/lib/api"
import {
  APP_MODEL_OPTIONS,
  DEFAULT_APP_MODEL_ID,
  type AppModelId,
  type AppSettingsPayload,
} from "@/lib/app-settings"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AppSettingsPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState<AppSettingsPayload | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<AppModelId>(DEFAULT_APP_MODEL_ID)
  const [deepSeekApiKey, setDeepSeekApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingModelId, setSavingModelId] = useState<AppModelId | null>(null)
  const [savingKey, setSavingKey] = useState(false)
  const [clearingKey, setClearingKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyMessage, setKeyMessage] = useState<string | null>(null)

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

  async function handleSaveKey() {
    const apiKey = deepSeekApiKey.trim()
    if (!apiKey || savingKey) return
    setSavingKey(true)
    setError(null)
    setKeyMessage(null)
    try {
      const payload = await updateAppSettings({ deepSeekApiKey: apiKey })
      setSettings(payload)
      setSelectedModelId(payload.modelId)
      setDeepSeekApiKey("")
      setKeyMessage("DeepSeek API Key 已保存。")
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 API Key 失败")
    } finally {
      setSavingKey(false)
    }
  }

  async function handleClearKey() {
    if (clearingKey) return
    setClearingKey(true)
    setError(null)
    setKeyMessage(null)
    try {
      const payload = await updateAppSettings({ clearDeepSeekApiKey: true })
      setSettings(payload)
      setDeepSeekApiKey("")
      setKeyMessage("DeepSeek API Key 已清除。")
    } catch (err) {
      setError(err instanceof Error ? err.message : "清除 API Key 失败")
    } finally {
      setClearingKey(false)
    }
  }

  async function handleTestKey() {
    if (testingKey) return
    setTestingKey(true)
    setError(null)
    setKeyMessage(null)
    try {
      const result = await testAppSettingsLlm()
      setKeyMessage(`连接成功，当前模型：${result.model}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "DeepSeek 连通性测试失败")
    } finally {
      setTestingKey(false)
    }
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      window.location.href = "/login"
    }
  }

  return (
    <section className={cn("space-y-7", className)}>
      <div className="space-y-5">
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
      </div>

      <div className="space-y-4 border-t border-border/70 pt-6">
        <div className="space-y-1">
          <h2 className="text-[13px] font-medium text-foreground">DeepSeek API Key</h2>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            每个账号独立保存密钥。密钥会在服务端加密存储，保存后不会再次显示原文。
          </p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background p-3">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-muted-foreground">当前状态</span>
            <span className={settings?.deepSeekConfigured ? "text-foreground" : "text-muted-foreground"}>
              {settings?.deepSeekConfigured
                ? `已配置 ${settings.deepSeekKeyPreview ?? ""}`
                : "未配置"}
            </span>
          </div>
          {settings?.deepSeekKeyUpdatedAt ? (
            <div className="mt-1 text-right text-[11px] text-muted-foreground">
              更新于 {new Date(settings.deepSeekKeyUpdatedAt).toLocaleString()}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            autoComplete="off"
            value={deepSeekApiKey}
            onChange={(event) => setDeepSeekApiKey(event.target.value)}
            placeholder="sk-..."
            className="min-w-0 flex-1"
          />
          <Button type="button" disabled={!deepSeekApiKey.trim() || savingKey} onClick={() => void handleSaveKey()}>
            {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!settings?.deepSeekConfigured || testingKey}
            onClick={() => void handleTestKey()}
          >
            {testingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            测试连接
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!settings?.deepSeekConfigured || clearingKey}
            onClick={() => void handleClearKey()}
          >
            {clearingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            清除密钥
          </Button>
        </div>
      </div>

      <div className="min-h-5 text-[12px] leading-relaxed text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在读取设置...
          </span>
        ) : error ? (
          <span className="text-destructive">{error}</span>
        ) : keyMessage ? (
          <span className="text-foreground">{keyMessage}</span>
        ) : settings?.deepSeekConfigured ? (
          `当前模型：${settings.activeModel ?? selectedModelId}`
        ) : (
          "请先保存 DeepSeek API Key，AI 对话和试写功能才会启用。"
        )}
      </div>

      <div className="border-t border-border/70 pt-5">
        <Button type="button" variant="ghost" disabled={loggingOut} onClick={() => void handleLogout()}>
          {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          退出登录
        </Button>
      </div>
    </section>
  )
}
