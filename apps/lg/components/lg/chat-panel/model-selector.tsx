"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Cpu, KeyRound, Loader2, Server } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { getAppSettings, updateAppSettings } from "@/lib/api"
import type { AppModelOption, AppPlatformOption, AppSettingsPayload } from "@/lib/app-settings"
import { cn } from "@/lib/utils"

type UserModelChoice = {
  key: string
  model: AppModelOption
  providerLabel: string
}

function platformKey(option: AppPlatformOption): string {
  return `platform:${option.id}`
}

function apiKey(option: AppModelOption): string {
  return `api:${option.provider}:${option.id}`
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0"
  const fixed = Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(4)
  return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
}

function formatPlatformPricing(option: AppPlatformOption): string {
  const input = formatMoney(option.pricing.promptCacheMissPricePerMillionCny)
  const output = formatMoney(option.pricing.outputPricePerMillionCny)
  const cache = option.pricing.promptCacheHitPricePerMillionCny
  return cache > 0
    ? `读 ${input} / 缓 ${formatMoney(cache)} / 出 ${output}`
    : `读 ${input} / 出 ${output}`
}

function currentLabel(settings: AppSettingsPayload | null): string {
  if (!settings) return "模型来源"
  if (settings.paymentSource === "api") {
    const model = settings.modelOptions.find((option) => option.provider === settings.provider && option.id === settings.modelId)
    return model?.label ?? settings.modelId
  }
  const platform = settings.platformOptions.find((option) => option.id === settings.platformProviderId)
  return platform ? `${platform.label} · ${platform.modelId}` : settings.platformModel ?? "平台模型"
}

export function ModelSelector() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettingsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      setLoading(true)
      try {
        const payload = await getAppSettings()
        if (!cancelled) setSettings(payload)
      } catch (error) {
        console.error("加载模型设置失败:", error)
        if (!cancelled) toast({ variant: "destructive", title: "模型设置加载失败" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [open])

  const platformOptions = useMemo(() => {
    return settings?.platformOptions.filter((option) => option.enabled && option.configured) ?? []
  }, [settings])

  const userModels = useMemo<UserModelChoice[]>(() => {
    if (!settings) return []
    const configuredProviders = new Set(
      settings.userProviderOptions.filter((option) => option.configured).map((option) => option.id),
    )
    const providerLabels = new Map(settings.userProviderOptions.map((option) => [option.id, option.label]))
    return settings.modelOptions
      .filter((model) => configuredProviders.has(model.provider))
      .map((model) => ({
        key: apiKey(model),
        model,
        providerLabel: providerLabels.get(model.provider) ?? model.provider,
      }))
  }, [settings])

  const selectedKey = settings?.paymentSource === "api"
    ? `api:${settings.provider}:${settings.modelId}`
    : settings?.platformProviderId
      ? `platform:${settings.platformProviderId}`
      : null

  async function selectPlatform(option: AppPlatformOption) {
    if (!settings || savingKey) return
    if (!settings.canUseBalance) {
      toast({ variant: "destructive", title: "余额通道不可用", description: "请确认平台模型已启用且当前账号余额可用。" })
      return
    }
    const key = platformKey(option)
    setSavingKey(key)
    try {
      const payload = await updateAppSettings({ paymentSource: "balance", platformProviderId: option.id })
      setSettings(payload)
      setOpen(false)
      toast({ title: "模型已切换", description: `平台：${option.label} · ${option.modelId}` })
    } catch (error) {
      console.error("切换平台模型失败:", error)
      toast({ variant: "destructive", title: "切换模型失败", description: error instanceof Error ? error.message : "未知错误" })
    } finally {
      setSavingKey(null)
    }
  }

  async function selectUserModel(choice: UserModelChoice) {
    if (!settings || savingKey) return
    setSavingKey(choice.key)
    try {
      const payload = await updateAppSettings({
        paymentSource: "api",
        provider: choice.model.provider,
        modelId: choice.model.id,
      })
      setSettings(payload)
      setOpen(false)
      toast({ title: "模型已切换", description: `我的 API：${choice.model.label}` })
    } catch (error) {
      console.error("切换个人 API 模型失败:", error)
      toast({ variant: "destructive", title: "切换模型失败", description: error instanceof Error ? error.message : "未知错误" })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={loading}
        className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        title="切换模型来源"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
        <span className="min-w-0 truncate">{currentLabel(settings)}</span>
        <ChevronDown className={cn("h-3 w-3 opacity-50 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-30 w-80 rounded-lg border border-border/70 bg-popover p-2 text-[12px] text-popover-foreground shadow-lg">
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">平台模型</div>
          <div className="grid gap-1">
            {platformOptions.map((option) => {
              const key = platformKey(option)
              const selected = selectedKey === key
              const unavailable = settings ? !settings.canUseBalance : true
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void selectPlatform(option)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-secondary",
                    selected && "bg-secondary text-foreground",
                    unavailable && "opacity-50",
                  )}
                  aria-disabled={unavailable || Boolean(savingKey)}
                >
                  <Server className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{option.label}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{option.modelId} · {formatPlatformPricing(option)} / 1M</span>
                  </span>
                  {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selected ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
              )
            })}
            {platformOptions.length === 0 ? <div className="px-2 py-2 text-muted-foreground">暂无可用平台模型</div> : null}
          </div>

          <div className="mt-2 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">我的 API</div>
          <div className="grid max-h-56 gap-1 overflow-y-auto">
            {userModels.map((choice) => {
              const selected = selectedKey === choice.key
              return (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => void selectUserModel(choice)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-secondary",
                    selected && "bg-secondary text-foreground",
                  )}
                  disabled={Boolean(savingKey)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{choice.model.label}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{choice.providerLabel} · {choice.model.id}</span>
                  </span>
                  {savingKey === choice.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selected ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
              )
            })}
            {userModels.length === 0 ? <div className="px-2 py-2 text-muted-foreground">暂无已配置的个人 API</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}
