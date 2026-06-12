"use client"

import { useEffect, useState } from "react"
import { Check, KeyRound, Loader2, LogOut, PlugZap, Save, Search, Trash2, Wallet } from "lucide-react"
import { getAppSettings, getMyBillingSummary, getMyBillingUsageRange, logout, testAppSettingsLlm, updateAppSettings } from "@/lib/api"
import {
  APP_MODEL_OPTIONS,
  DEFAULT_APP_MODEL_ID,
  DEFAULT_PAYMENT_SOURCE,
  type AppPaymentSource,
  type AppModelId,
  type AppSettingsPayload,
} from "@/lib/app-settings"
import type { BillingUsageRangePayload, BillingUserSummary } from "@/lib/billing"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "¥0"
  return value >= 1 ? `¥${value.toFixed(2)}` : `¥${value.toFixed(6).replace(/0+$/, "0")}`
}

function formatTokenCount(value: number): string {
  if (!Number.isFinite(value)) return "0"
  return Math.floor(value).toLocaleString("zh-CN")
}

function toDateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function dateTimeLocalToIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPaymentSource(source: string | undefined): string {
  return source === "balance" ? "余额" : source === "api" ? "API" : "-"
}

function UsageMetric({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div className={cn(
      "rounded-lg border border-border/70 bg-background",
      compact ? "px-2.5 py-2" : "p-3",
    )}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono font-medium text-foreground", compact ? "text-[12px]" : "text-[15px]")}>
        {value}
      </div>
    </div>
  )
}

export function AppSettingsPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState<AppSettingsPayload | null>(null)
  const [billing, setBilling] = useState<BillingUserSummary | null>(null)
  const [usageRange, setUsageRange] = useState<BillingUsageRangePayload | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<AppModelId>(DEFAULT_APP_MODEL_ID)
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<AppPaymentSource>(DEFAULT_PAYMENT_SOURCE)
  const [usageFrom, setUsageFrom] = useState(() => toDateTimeLocalValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
  const [usageTo, setUsageTo] = useState(() => toDateTimeLocalValue(new Date()))
  const [deepSeekApiKey, setDeepSeekApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingModelId, setSavingModelId] = useState<AppModelId | null>(null)
  const [savingPaymentSource, setSavingPaymentSource] = useState<AppPaymentSource | null>(null)
  const [savingKey, setSavingKey] = useState(false)
  const [clearingKey, setClearingKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [loadingUsageRange, setLoadingUsageRange] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyMessage, setKeyMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      getAppSettings(),
      getMyBillingSummary().catch(() => null),
      getMyBillingUsageRange({
        from: dateTimeLocalToIso(usageFrom),
        to: dateTimeLocalToIso(usageTo),
        limit: 100,
      }).catch(() => null),
    ])
      .then(([payload, billingPayload, usagePayload]) => {
        if (cancelled) return
        setSettings(payload)
        setBilling(billingPayload)
        setUsageRange(usagePayload)
        setSelectedModelId(payload.modelId)
        setSelectedPaymentSource(payload.paymentSource)
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

  async function loadUsageRange() {
    if (loadingUsageRange) return
    setLoadingUsageRange(true)
    setError(null)
    try {
      const payload = await getMyBillingUsageRange({
        from: dateTimeLocalToIso(usageFrom),
        to: dateTimeLocalToIso(usageTo),
        limit: 100,
      })
      setUsageRange(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取用量失败")
    } finally {
      setLoadingUsageRange(false)
    }
  }

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

  async function handleSelectPaymentSource(paymentSource: AppPaymentSource) {
    if (savingPaymentSource || paymentSource === selectedPaymentSource) return
    const previousPaymentSource = selectedPaymentSource
    setSelectedPaymentSource(paymentSource)
    setSavingPaymentSource(paymentSource)
    setError(null)

    try {
      const payload = await updateAppSettings({ paymentSource })
      setSettings(payload)
      setSelectedPaymentSource(payload.paymentSource)
      const billingPayload = await getMyBillingSummary().catch(() => null)
      setBilling(billingPayload)
    } catch (err) {
      setSelectedPaymentSource(previousPaymentSource)
      setError(err instanceof Error ? err.message : "保存支付方式失败")
    } finally {
      setSavingPaymentSource(null)
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
      setSelectedPaymentSource(payload.paymentSource)
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
      setSelectedPaymentSource(payload.paymentSource)
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
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background p-3">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              余额
            </div>
            <div className="mt-2 text-xl font-semibold tracking-normal">{formatMoney(billing?.balanceCny ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-3">
            <div className="text-[12px] text-muted-foreground">余额已用</div>
            <div className="mt-2 text-xl font-semibold tracking-normal">{formatMoney(billing?.usedBalanceCny ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-3">
            <div className="text-[12px] text-muted-foreground">AI 请求</div>
            <div className="mt-2 text-xl font-semibold tracking-normal">{billing?.requestCount ?? 0}</div>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-[13px] font-medium text-foreground">支付方式</h2>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="支付方式">
            {[
              { id: "balance" as const, label: "使用余额", icon: Wallet, detail: billing?.canUseBalance ? "平台余额可用" : "需要余额和平台 Key" },
              { id: "api" as const, label: "使用自己的 API", icon: KeyRound, detail: settings?.deepSeekConfigured ? "个人 Key 已配置" : "需要保存 API Key" },
            ].map((option) => {
              const active = selectedPaymentSource === option.id
              const saving = savingPaymentSource === option.id
              const Icon = option.icon
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={loading || Boolean(savingPaymentSource)}
                  onClick={() => void handleSelectPaymentSource(option.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                    active
                      ? "border-primary/55 bg-primary/10 text-foreground"
                      : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{option.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{option.detail}</span>
                    </span>
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
      </div>

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
        ) : selectedPaymentSource === "balance" ? (
          billing?.canUseBalance
            ? `当前使用余额，模型：${settings?.activeModel ?? selectedModelId}`
            : "当前选择余额；余额为 0 或平台 Key 未配置时，AI 请求会被拦截。"
        ) : settings?.deepSeekConfigured ? (
          `当前使用自己的 API，模型：${settings.activeModel ?? selectedModelId}`
        ) : (
          "当前选择自己的 API；请先保存 DeepSeek API Key。"
        )}
      </div>

      <div className="space-y-4 border-t border-border/70 pt-6">
        <div className="space-y-1">
          <h2 className="text-[13px] font-medium text-foreground">用量</h2>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            统计当前账号的模型调用，金额为按后台单价计算的估算值。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UsageMetric label="缓存命中输入" value={formatTokenCount(billing?.promptCacheHitTokens ?? 0)} />
          <UsageMetric label="读入输入" value={formatTokenCount(billing?.promptCacheMissTokens ?? 0)} />
          <UsageMetric label="输出 token" value={formatTokenCount(billing?.completionTokens ?? 0)} />
          <UsageMetric label="预计金额" value={formatMoney(billing?.estimatedCostCny ?? 0)} />
        </div>

        <div className="rounded-lg border border-border/70 bg-background p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="space-y-1.5">
              <span className="block text-[12px] font-medium text-muted-foreground">开始</span>
              <Input
                type="datetime-local"
                value={usageFrom}
                onChange={(event) => setUsageFrom(event.target.value)}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-[12px] font-medium text-muted-foreground">结束</span>
              <Input
                type="datetime-local"
                value={usageTo}
                onChange={(event) => setUsageTo(event.target.value)}
              />
            </label>
            <Button type="button" variant="outline" disabled={loadingUsageRange} onClick={() => void loadUsageRange()}>
              {loadingUsageRange ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              查询
            </Button>
          </div>

          <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-4">
            <UsageMetric compact label="区间请求" value={`${usageRange?.summary.requestCount ?? 0}`} />
            <UsageMetric compact label="区间 token" value={formatTokenCount(usageRange?.summary.totalTokens ?? 0)} />
            <UsageMetric compact label="区间估算" value={formatMoney(usageRange?.summary.estimatedCostCny ?? 0)} />
            <UsageMetric compact label="区间扣费" value={formatMoney(usageRange?.summary.chargedAmountCny ?? 0)} />
          </div>

          <div className="mt-3 max-h-64 overflow-auto rounded-md border border-border/60">
            {usageRange?.entries.length ? (
              <div className="divide-y divide-border/60">
                {usageRange.entries.map((entry) => (
                  <div key={entry.id} className="grid gap-2 px-3 py-2 text-[12px] sm:grid-cols-[112px_minmax(0,1fr)_90px_90px] sm:items-center">
                    <div className="text-muted-foreground">{formatDateTime(entry.createdAt)}</div>
                    <div className="min-w-0">
                      <div className="truncate text-foreground">{entry.feature ?? "AI 调用"} · {formatPaymentSource(entry.paymentSource)}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        hit {formatTokenCount(entry.promptCacheHitTokens ?? 0)} / read {formatTokenCount(entry.promptCacheMissTokens ?? 0)} / out {formatTokenCount(entry.completionTokens ?? 0)}
                      </div>
                    </div>
                    <div className="font-mono text-muted-foreground">{formatTokenCount(entry.totalTokens ?? 0)} tok</div>
                    <div className="font-mono text-foreground">{formatMoney(entry.estimatedCostCny ?? 0)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                当前区间没有调用记录
              </div>
            )}
          </div>
        </div>
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
