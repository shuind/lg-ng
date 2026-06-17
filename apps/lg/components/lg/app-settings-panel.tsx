"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, KeyRound, Loader2, LogOut, Pencil, PlugZap, Plus, Save, Search, Trash2, Wallet } from "lucide-react"
import { getAppSettings, getMyBillingSummary, getMyBillingUsageRange, logout, testAppSettingsLlm, updateAppSettings } from "@/lib/api"
import {
  APP_MODEL_OPTIONS,
  APP_PROVIDER_OPTIONS,
  DEFAULT_APP_MODEL_ID,
  DEFAULT_APP_PROVIDER,
  DEFAULT_PAYMENT_SOURCE,
  getAppProviderOption,
  getDefaultModelForProvider,
  type AppCustomProvider,
  type AppPaymentSource,
  type AppProviderId,
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

function isCustomProvider(settings: AppSettingsPayload | null, provider: AppProviderId): boolean {
  return Boolean(settings?.customProviders.some((item) => item.id === provider))
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
  const [selectedProvider, setSelectedProvider] = useState<AppProviderId>(DEFAULT_APP_PROVIDER)
  const [selectedModelId, setSelectedModelId] = useState<AppModelId>(DEFAULT_APP_MODEL_ID)
  const [selectedPaymentSource, setSelectedPaymentSource] = useState<AppPaymentSource>(DEFAULT_PAYMENT_SOURCE)
  const [manualModelId, setManualModelId] = useState(DEFAULT_APP_MODEL_ID)
  const [usageFrom, setUsageFrom] = useState(() => toDateTimeLocalValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
  const [usageTo, setUsageTo] = useState(() => toDateTimeLocalValue(new Date()))
  const [providerApiKey, setProviderApiKey] = useState("")
  const [providerBaseUrl, setProviderBaseUrl] = useState("")
  const [customEditingId, setCustomEditingId] = useState<string | null>(null)
  const [customLabel, setCustomLabel] = useState("")
  const [customBaseUrl, setCustomBaseUrl] = useState("")
  const [customModelId, setCustomModelId] = useState("")
  const [customApiKey, setCustomApiKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingProvider, setSavingProvider] = useState<AppProviderId | null>(null)
  const [savingModelId, setSavingModelId] = useState<AppModelId | null>(null)
  const [savingManualModel, setSavingManualModel] = useState(false)
  const [savingPaymentSource, setSavingPaymentSource] = useState<AppPaymentSource | null>(null)
  const [savingKey, setSavingKey] = useState(false)
  const [savingBaseUrl, setSavingBaseUrl] = useState(false)
  const [savingCustom, setSavingCustom] = useState(false)
  const [deletingCustomId, setDeletingCustomId] = useState<string | null>(null)
  const [clearingKey, setClearingKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [loadingUsageRange, setLoadingUsageRange] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"model" | "access" | "usage" | "account">("model")

  const customProviders = settings?.customProviders ?? []
  const providerOptions = settings?.providerOptions ?? APP_PROVIDER_OPTIONS
  const modelOptions = settings?.modelOptions ?? APP_MODEL_OPTIONS
  const currentProviderOption = useMemo(
    () => getAppProviderOption(selectedProvider, customProviders),
    [selectedProvider, customProviders],
  )
  const recommendedModelOption = modelOptions.find((option) => option.id === DEFAULT_APP_MODEL_ID) ?? modelOptions[0]
  const backupProviderOptions = providerOptions.filter((option) => option.id !== DEFAULT_APP_PROVIDER && !option.custom)
  const customProviderActive = isCustomProvider(settings, selectedProvider)
  const isRecommendedActive = selectedProvider === DEFAULT_APP_PROVIDER && selectedModelId === DEFAULT_APP_MODEL_ID
  const providerModelOptions = useMemo(
    () => modelOptions.filter((option) => option.provider === selectedProvider),
    [modelOptions, selectedProvider],
  )
  const paymentOptions = [
    {
      id: "balance" as const,
      label: "使用余额",
      icon: Wallet,
      detail: billing?.canUseBalance ? "使用管理员默认平台模型" : "需要余额和平台模型配置",
      disabled: false,
    },
    {
      id: "api" as const,
      label: "使用自己的 API",
      icon: KeyRound,
      detail: settings?.providerConfigured ? "个人 Key 已配置" : "需要保存 API Key",
      disabled: false,
    },
  ]
  const tabs = [
    { id: "model" as const, label: "模型", description: selectedModelId },
    { id: "access" as const, label: "接入", description: currentProviderOption.label },
    { id: "usage" as const, label: "用量", description: formatMoney(billing?.estimatedCostCny ?? 0) },
    { id: "account" as const, label: "账号", description: billing ? formatMoney(billing.balanceCny) : "-" },
  ]

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
        applySettingsPayload(payload)
        setBilling(billingPayload)
        setUsageRange(usagePayload)
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

  function applySettingsPayload(payload: AppSettingsPayload) {
    setSettings(payload)
    setSelectedProvider(payload.provider)
    setSelectedModelId(payload.modelId)
    setSelectedPaymentSource(payload.paymentSource)
    setManualModelId(payload.modelId)
    setProviderBaseUrl(payload.providerBaseUrl ?? "")
  }

  function resetCustomForm() {
    setCustomEditingId(null)
    setCustomLabel("")
    setCustomBaseUrl("")
    setCustomModelId("")
    setCustomApiKey("")
  }

  function editCustomProvider(provider: AppCustomProvider) {
    setCustomEditingId(provider.id)
    setCustomLabel(provider.label)
    setCustomBaseUrl(provider.baseUrl)
    setCustomModelId(provider.modelId)
    setCustomApiKey("")
  }

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

  async function handleSelectProvider(provider: AppProviderId) {
    if (savingProvider || provider === selectedProvider) return
    const previousProvider = selectedProvider
    const previousModelId = selectedModelId
    const previousPaymentSource = selectedPaymentSource
    const nextModelId = getDefaultModelForProvider(provider, customProviders)
    const nextPaymentSource = selectedPaymentSource
    setSelectedProvider(provider)
    setSelectedModelId(nextModelId)
    setSelectedPaymentSource(nextPaymentSource)
    setSavingProvider(provider)
    setError(null)
    setKeyMessage(null)

    try {
      const payload = await updateAppSettings({ provider, modelId: nextModelId, paymentSource: nextPaymentSource })
      applySettingsPayload(payload)
    } catch (err) {
      setSelectedProvider(previousProvider)
      setSelectedModelId(previousModelId)
      setSelectedPaymentSource(previousPaymentSource)
      setError(err instanceof Error ? err.message : "保存供应商失败")
    } finally {
      setSavingProvider(null)
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
      applySettingsPayload(payload)
    } catch (err) {
      setSelectedModelId(previousModelId)
      setError(err instanceof Error ? err.message : "保存设置失败")
    } finally {
      setSavingModelId(null)
    }
  }

  async function handleSaveManualModel() {
    const modelId = manualModelId.trim()
    if (!modelId || savingManualModel || modelId === selectedModelId) return
    const previousModelId = selectedModelId
    setSelectedModelId(modelId)
    setSavingManualModel(true)
    setError(null)
    setKeyMessage(null)

    try {
      const payload = await updateAppSettings({ modelId })
      applySettingsPayload(payload)
      setKeyMessage(`模型已切换为 ${payload.modelId}`)
    } catch (err) {
      setSelectedModelId(previousModelId)
      setManualModelId(previousModelId)
      setError(err instanceof Error ? err.message : "保存模型失败")
    } finally {
      setSavingManualModel(false)
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
      applySettingsPayload(payload)
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
    const apiKey = providerApiKey.trim()
    if (!apiKey || savingKey) return
    setSavingKey(true)
    setError(null)
    setKeyMessage(null)
    try {
      const payload = await updateAppSettings({ providerApiKey: apiKey })
      applySettingsPayload(payload)
      setProviderApiKey("")
      setKeyMessage(`${currentProviderOption.label} API Key 已保存。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 API Key 失败")
    } finally {
      setSavingKey(false)
    }
  }

  async function handleSaveBaseUrl() {
    if (savingBaseUrl) return
    setSavingBaseUrl(true)
    setError(null)
    setKeyMessage(null)
    try {
      const payload = await updateAppSettings({ providerBaseUrl })
      applySettingsPayload(payload)
      setKeyMessage(`${currentProviderOption.label} 接口地址已保存。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存接口地址失败")
    } finally {
      setSavingBaseUrl(false)
    }
  }

  async function handleClearKey() {
    if (clearingKey) return
    setClearingKey(true)
    setError(null)
    setKeyMessage(null)
    try {
      const payload = await updateAppSettings({ clearProviderApiKey: true })
      applySettingsPayload(payload)
      setProviderApiKey("")
      setKeyMessage(`${currentProviderOption.label} API Key 已清除。`)
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
      const label = getAppProviderOption(result.provider, settings?.customProviders ?? []).label
      setKeyMessage(`连接成功，${label} / ${result.model}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "模型连通性测试失败")
    } finally {
      setTestingKey(false)
    }
  }

  async function handleSaveCustomProvider() {
    if (savingCustom) return
    if (!customLabel.trim() || !customBaseUrl.trim() || !customModelId.trim()) {
      setError("请填写自定义配置的名称、接口地址和模型 ID")
      return
    }
    const existing = customEditingId ? customProviders.find((provider) => provider.id === customEditingId) : null
    if (!existing && !customApiKey.trim()) {
      setError("新增自定义配置需要 API Key")
      return
    }
    setSavingCustom(true)
    setError(null)
    setKeyMessage(null)
    try {
      const payload = await updateAppSettings({
        customProviderId: customEditingId ?? undefined,
        customProviderLabel: customLabel,
        customProviderBaseUrl: customBaseUrl,
        customProviderModelId: customModelId,
        customProviderApiKey: customApiKey,
      })
      applySettingsPayload(payload)
      resetCustomForm()
      setKeyMessage(`${customLabel.trim()} 已保存。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存自定义配置失败")
    } finally {
      setSavingCustom(false)
    }
  }

  async function handleDeleteCustomProvider(providerId: string) {
    if (deletingCustomId) return
    setDeletingCustomId(providerId)
    setError(null)
    setKeyMessage(null)
    try {
      const payload = await updateAppSettings({ deleteCustomProviderId: providerId })
      applySettingsPayload(payload)
      if (customEditingId === providerId) resetCustomForm()
      setKeyMessage("自定义配置已删除。")
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除自定义配置失败")
    } finally {
      setDeletingCustomId(null)
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
    <section className={cn("space-y-5", className)}>
      <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/20 p-1 sm:grid-cols-4" role="tablist" aria-label="设置分类">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-lg px-3 py-2 text-left transition",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <span className="block text-[13px] font-medium">{tab.label}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{tab.description}</span>
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
        ) : keyMessage ? (
          <span className="text-foreground">{keyMessage}</span>
        ) : selectedPaymentSource === "balance" ? (
          billing?.canUseBalance
            ? `当前使用余额，管理员默认模型：${settings?.platformProvider ?? "平台"} / ${settings?.platformModel ?? "未配置"}`
            : settings?.providerConfigured && settings.activeProvider !== "none"
              ? `余额暂不可用，已改用自己的 API：${settings.activeProvider} / ${settings.activeModel ?? selectedModelId}`
              : "当前选择余额；余额为 0 或平台模型未配置时，AI 请求会被拦截。"
        ) : settings?.providerConfigured ? (
          `当前使用自己的 API，供应商：${currentProviderOption.label}，模型：${settings.activeModel ?? selectedModelId}`
        ) : (
          `当前选择自己的 API；请先保存 ${currentProviderOption.label} API Key。`
        )}
      </div>

      {activeTab === "model" ? (
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-[13px] font-medium text-foreground">AI 模型</h2>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              余额使用管理员默认平台模型；这里的供应商和模型用于自备 API 模式。
            </p>
          </div>

          <div className={cn(
            "rounded-xl border p-4 transition",
            isRecommendedActive
              ? "border-primary/60 bg-primary/10"
              : "border-border/70 bg-background",
          )}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    推荐默认
                  </span>
                  <span className="text-[11px] text-muted-foreground">主路径 · 余额优先</span>
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-foreground">DeepSeek V4 Flash</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    日常写作的推荐预设。选择余额时会走管理员默认平台模型；选择自己的 API 时使用这里的 DeepSeek 配置。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full border border-border/70 bg-background px-2 py-1">
                    余额 {billing?.canUseBalance ? "可用" : "未就绪"}
                  </span>
                  <span className="rounded-full border border-border/70 bg-background px-2 py-1">
                    当前 {isRecommendedActive ? "正在使用" : `${currentProviderOption.label} / ${selectedModelId}`}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant={isRecommendedActive ? "outline" : "default"}
                disabled={loading || Boolean(savingProvider)}
                onClick={() => void handleSelectProvider(DEFAULT_APP_PROVIDER)}
                className="shrink-0"
              >
                {savingProvider === DEFAULT_APP_PROVIDER ? <Loader2 className="h-4 w-4 animate-spin" /> : isRecommendedActive ? <Check className="h-4 w-4" /> : null}
                {isRecommendedActive ? "已使用默认" : "切回默认"}
              </Button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="模型支付方式">
              {paymentOptions.map((option) => {
                const active = selectedPaymentSource === option.id
                const saving = savingPaymentSource === option.id
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={loading || Boolean(savingPaymentSource) || option.disabled}
                    onClick={() => void handleSelectPaymentSource(option.id)}
                    className={cn(
                      "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55",
                      active
                        ? "border-primary/55 bg-background text-foreground"
                        : "border-border/70 bg-background/70 text-muted-foreground hover:bg-accent/60 hover:text-foreground",
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

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[13px] font-medium text-foreground">内置预设</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  预设供应商仍可手动保存 Key、接口地址，并选择或输入模型 ID。
                </p>
              </div>
              {selectedProvider !== DEFAULT_APP_PROVIDER && !customProviderActive ? (
                <span className="mt-2 rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground sm:mt-0">
                  当前预设：{currentProviderOption.label}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="内置模型供应商">
              {backupProviderOptions.map((option) => {
                const active = selectedProvider === option.id
                const saving = savingProvider === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={loading || Boolean(savingProvider)}
                    onClick={() => void handleSelectProvider(option.id)}
                    className={cn(
                      "flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                      active
                        ? "border-primary/50 bg-background text-foreground"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{option.label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{option.description}</span>
                    </span>
                    {saving ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : active ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-[12px] font-medium text-muted-foreground">
                  {customProviderActive ? "自定义模型" : selectedProvider === DEFAULT_APP_PROVIDER ? "DeepSeek 可选模型" : `${currentProviderOption.label} 模型`}
                </h4>
                {selectedProvider === DEFAULT_APP_PROVIDER ? (
                  <span className="text-[11px] text-muted-foreground">默认无需调整</span>
                ) : null}
              </div>
              <div className="grid gap-2" role="radiogroup" aria-label="模型">
                {providerModelOptions.map((option) => {
                  const active = selectedModelId === option.id
                  const saving = savingModelId === option.id
                  const recommended = option.id === recommendedModelOption?.id
                  return (
                    <button
                      key={`${option.provider}:${option.id}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={loading || Boolean(savingModelId)}
                      onClick={() => void handleSelectModel(option.id)}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                        active
                          ? "border-primary/55 bg-background text-foreground"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[13px] font-medium">
                          {option.label}
                          {recommended ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">默认</span> : null}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">{option.description} · {option.id}</span>
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
              <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background p-3 sm:flex-row">
                <Input
                  value={manualModelId}
                  onChange={(event) => setManualModelId(event.target.value)}
                  placeholder="手动输入模型 ID"
                  className="min-w-0 flex-1 font-mono text-[12px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!manualModelId.trim() || savingManualModel || manualModelId.trim() === selectedModelId}
                  onClick={() => void handleSaveManualModel()}
                >
                  {savingManualModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存模型
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[13px] font-medium text-foreground">自定义 OpenAI 兼容</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  保存多个自定义 Base URL / 模型 ID / API Key 组合，按需切换。
                </p>
              </div>
              <Button type="button" variant="outline" onClick={resetCustomForm}>
                <Plus className="h-4 w-4" />
                新增
              </Button>
            </div>

            <div className="mt-3 grid gap-2">
              {customProviders.length ? customProviders.map((provider) => {
                const active = selectedProvider === provider.id
                const saving = savingProvider === provider.id
                const deleting = deletingCustomId === provider.id
                return (
                  <div
                    key={provider.id}
                    className={cn(
                      "grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                      active ? "border-primary/55 bg-primary/5" : "border-border/70 bg-muted/20",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{provider.label}</span>
                        {active ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">当前</span> : null}
                        <span className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {provider.configured ? "Key 已配置" : "缺少 Key"}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{provider.modelId}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{provider.baseUrl}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant={active ? "outline" : "default"}
                        disabled={loading || Boolean(savingProvider)}
                        onClick={() => void handleSelectProvider(provider.id)}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <Check className="h-4 w-4" /> : null}
                        {active ? "已使用" : "使用"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => editCustomProvider(provider)}>
                        <Pencil className="h-4 w-4" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={deleting}
                        onClick={() => void handleDeleteCustomProvider(provider.id)}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        删除
                      </Button>
                    </div>
                  </div>
                )
              }) : (
                <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
                  暂无自定义配置
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="text-[12px] font-medium text-muted-foreground">
                {customEditingId ? "编辑自定义配置" : "新增自定义配置"}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="名称，如 OpenRouter" />
                <Input value={customModelId} onChange={(event) => setCustomModelId(event.target.value)} placeholder="模型 ID，如 openai/gpt-4.1" />
              </div>
              <Input type="url" value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} placeholder="https://your-provider.example.com/v1" />
              <Input type="password" autoComplete="off" value={customApiKey} onChange={(event) => setCustomApiKey(event.target.value)} placeholder={customEditingId ? "留空则不更新 Key" : "API Key"} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={savingCustom} onClick={() => void handleSaveCustomProvider()}>
                  {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存自定义
                </Button>
                {customEditingId ? (
                  <Button type="button" variant="ghost" onClick={resetCustomForm}>
                    取消编辑
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "access" ? (
        <div className={cn(
          "space-y-4 rounded-xl border p-4",
          selectedProvider === DEFAULT_APP_PROVIDER
            ? "border-border/70 bg-background"
            : "border-primary/35 bg-primary/5",
        )}>
          <div className="space-y-1">
            <h2 className="text-[13px] font-medium text-foreground">
              {selectedProvider === DEFAULT_APP_PROVIDER ? "DeepSeek API Key（可选）" : `${currentProviderOption.label} 接入配置`}
            </h2>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {selectedProvider === DEFAULT_APP_PROVIDER
                ? "选择余额时无需填写；只有在使用自己的 DeepSeek API 时才需要保存这里。"
                : customProviderActive
                  ? "自定义配置用于自己的 API；选择余额时会走管理员默认平台模型。"
                  : "备用模型不会默认启用，需要保存对应中转站/供应商的 Key 和 OpenAI 兼容接口地址。"}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-3">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-muted-foreground">当前状态</span>
              <span className={settings?.providerConfigured ? "text-foreground" : "text-muted-foreground"}>
                {settings?.providerConfigured
                  ? `已配置 ${settings.providerKeyPreview ?? "环境变量"}`
                  : "未配置"}
              </span>
            </div>
            {settings?.providerKeyUpdatedAt ? (
              <div className="mt-1 text-right text-[11px] text-muted-foreground">
                更新于 {new Date(settings.providerKeyUpdatedAt).toLocaleString()}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              autoComplete="off"
              value={providerApiKey}
              onChange={(event) => setProviderApiKey(event.target.value)}
              placeholder={currentProviderOption.apiKeyPlaceholder}
              className="min-w-0 flex-1"
            />
            <Button type="button" disabled={!providerApiKey.trim() || savingKey} onClick={() => void handleSaveKey()}>
              {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存 Key
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              autoComplete="off"
              value={providerBaseUrl}
              onChange={(event) => setProviderBaseUrl(event.target.value)}
              placeholder={currentProviderOption.defaultBaseUrl || "https://your-relay.example.com/v1"}
              className="min-w-0 flex-1"
            />
            <Button type="button" variant="outline" disabled={savingBaseUrl} onClick={() => void handleSaveBaseUrl()}>
              {savingBaseUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存接口
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!settings?.providerConfigured || testingKey}
              onClick={() => void handleTestKey()}
            >
              {testingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              测试连接
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!settings?.providerConfigured || clearingKey}
              onClick={() => void handleClearKey()}
            >
              {clearingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              清除密钥
            </Button>
          </div>
        </div>
      ) : null}

      {activeTab === "usage" ? (
        <div className="space-y-4">
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
                          缓存命中 {formatTokenCount(entry.promptCacheHitTokens ?? 0)} / 读入 {formatTokenCount(entry.promptCacheMissTokens ?? 0)} / 输出 {formatTokenCount(entry.completionTokens ?? 0)}
                        </div>
                      </div>
                      <div className="font-mono text-muted-foreground">{formatTokenCount(entry.totalTokens ?? 0)} token</div>
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
      ) : null}

      {activeTab === "account" ? (
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

          <div className="rounded-xl border border-border/70 bg-background p-4">
            <div className="space-y-1">
              <h2 className="text-[13px] font-medium text-foreground">账号</h2>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                登录状态和账号相关操作。
              </p>
            </div>
            <div className="mt-4">
              <Button type="button" variant="ghost" disabled={loggingOut} onClick={() => void handleLogout()}>
                {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                退出登录
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
