"use client"

import type { FormEvent, ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  Bug,
  Coins,
  Database,
  HardDrive,
  KeyRound,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  Ticket,
  Trash2,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AdminApiError,
  adjustAdminBillingBalance,
  clearAdminPlatformKey,
  createAdminInvite,
  getAdminOverview,
  saveAdminPlatformKey,
  testAdminPlatformKey,
  updateAdminApiDebugLogSettings,
  updateAdminBillingSettings,
  updateAdminInvite,
  type AdminInviteOverview,
  type AdminOverviewPayload,
  type AdminUserOverview,
} from "@/lib/api"
import type { BillingPlatformProvider, BillingPricing, BillingUserSummary } from "@/lib/billing"
import { cn } from "@/lib/utils"

const DEFAULT_INVITE_MAX_REDEMPTIONS = 10

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatDate(value: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0"
  const fixed = Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(6)
  return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "管理后台数据加载失败"
}

function formatPlatformProviderSource(source: BillingPlatformProvider["source"]): string {
  return source === "environment" ? "环境变量" : "后台保存"
}

function formatActivePlatformProvider(provider: BillingPlatformProvider | null): string {
  if (!provider) return "未配置"
  return `${provider.label} · ${provider.provider} / ${provider.modelId}`
}

function formatActivePlatformSource(
  source: AdminOverviewPayload["billing"]["platformKeySource"],
  preview: string | null,
): string {
  if (source === "environment") return "环境变量"
  if (source === "admin") return preview ? `后台保存 ${preview}` : "后台保存"
  return "无"
}

function formatApiDebugLogSource(source: AdminOverviewPayload["debug"]["apiDebugLog"]["source"]): string {
  if (source === "environment") return "环境变量"
  if (source === "admin") return "后台开关"
  return "默认关闭"
}

function defaultPlatformDraft(pricing?: BillingPricing) {
  return {
    id: "",
    label: "DeepSeek 官方",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    modelId: "deepseek-v4-flash",
    pricing: createBillingPricingDraft(pricing ?? {
      promptCacheHitPricePerMillionCny: 0,
      promptCacheMissPricePerMillionCny: 0,
      outputPricePerMillionCny: 0,
    }),
    apiKey: "",
    setActive: true,
  }
}

function platformDraftFromProvider(provider: BillingPlatformProvider) {
  return {
    id: provider.id,
    label: provider.label,
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    modelId: provider.modelId,
    pricing: createBillingPricingDraft(provider.pricing),
    apiKey: "",
    setActive: true,
  }
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: "default" | "warning"
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            tone === "warning"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  )
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "good" | "warning"
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 text-[12px] font-medium",
        tone === "good" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "neutral" && "border-border/70 bg-background text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

function MoneyNumberInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  suffix: string
}) {
  const [draft, setDraft] = useState(formatNumberDraft(value))

  useEffect(() => {
    setDraft(formatNumberDraft(value))
  }, [value])

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft)
    const trimmed = nextDraft.trim()
    if (!trimmed) return
    const numberValue = Number(trimmed)
    if (Number.isFinite(numberValue) && numberValue >= 0) {
      onChange(numberValue)
    }
  }

  function normalizeDraft() {
    const numberValue = Number(draft.trim())
    setDraft(formatNumberDraft(Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : value))
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={draft}
          onBlur={normalizeDraft}
          onChange={(event) => updateDraft(event.target.value)}
        />
        <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{suffix}</span>
      </div>
    </label>
  )
}

function formatNumberDraft(value: number): string {
  return Number.isFinite(value) ? String(value) : "0"
}

function UserRow({
  user,
  billingUsage,
  billingAdjustmentDraft,
  billingSaving,
  billingCanSave,
  onBillingAdjustmentDraftChange,
  onSaveBillingAdjustment,
}: {
  user: AdminUserOverview
  billingUsage?: BillingUserSummary
  billingAdjustmentDraft: string
  billingSaving: boolean
  billingCanSave: boolean
  onBillingAdjustmentDraftChange: (value: string) => void
  onSaveBillingAdjustment: () => void
}) {
  const balanceCny = billingUsage?.balanceCny ?? 0
  const usedBalanceCny = billingUsage?.usedBalanceCny ?? 0

  return (
    <div className="grid gap-3 border-t border-border/60 px-4 py-3 text-[13px] lg:grid-cols-[minmax(220px,1.4fr)_72px_88px_96px_132px_132px_116px_112px] lg:items-center">
      <div className="min-w-0">
        <div className="truncate font-medium">{user.email}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{user.id}</div>
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">书籍</div>
        {user.booksCount}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">数据</div>
        {formatBytes(user.dataBytes)}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">模型 Key</div>
        {user.hasPersonalDeepSeekKey ? (
          <StatusPill tone="good">{user.deepSeekKeyPreview ?? "已配置"}</StatusPill>
        ) : (
          <StatusPill tone="warning">未配置</StatusPill>
        )}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">余额</div>
        <span>{formatMoney(balanceCny)}</span>
        {usedBalanceCny > 0 ? (
          <span className="ml-1 text-muted-foreground">已用 {formatMoney(usedBalanceCny)}</span>
        ) : null}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">调整</div>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-24 text-[13px]"
            type="number"
            step="0.000001"
            value={billingAdjustmentDraft}
            onChange={(event) => onBillingAdjustmentDraftChange(event.target.value)}
          />
          <Button
            aria-label={`调整 ${user.email} 的余额`}
            className="h-8 w-8 p-0"
            type="button"
            size="sm"
            variant="outline"
            disabled={!billingCanSave}
            onClick={onSaveBillingAdjustment}
          >
            <Coins className={cn("h-3.5 w-3.5", billingSaving && "animate-pulse")} />
          </Button>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">正数充值，负数扣减。</div>
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">会话</div>
        <span>{user.activeSessionCount} 活跃</span>
        {user.expiredSessionCount > 0 ? (
          <span className="ml-1 text-muted-foreground">/ {user.expiredSessionCount} 过期</span>
        ) : null}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">最近数据</div>
        {formatDate(user.dataUpdatedAt)}
      </div>
    </div>
  )
}

function InviteRow({
  invite,
  maxDraft,
  saving,
  onMaxDraftChange,
  onSaveMax,
}: {
  invite: AdminInviteOverview
  maxDraft: string
  saving: boolean
  onMaxDraftChange: (value: string) => void
  onSaveMax: () => void
}) {
  const latestRedemption = invite.redeemedUsers[invite.redeemedUsers.length - 1] ?? null
  const redeemedLabel = latestRedemption
    ? `${latestRedemption.email ?? latestRedemption.userId}${invite.redeemedCount > 1 ? `，另有 ${invite.redeemedCount - 1} 人` : ""}`
    : "-"
  const maxDraftNumber = Number(maxDraft)
  const canSaveMax = invite.editable
    && Number.isFinite(maxDraftNumber)
    && maxDraftNumber >= 1
    && Math.floor(maxDraftNumber) !== invite.maxRedemptions
    && !saving

  return (
    <div className="grid gap-3 border-t border-border/60 px-4 py-3 text-[13px] md:grid-cols-[minmax(180px,1fr)_168px_minmax(200px,1fr)_120px] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-mono">{invite.code ?? "已移除邀请码"}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{invite.codeHash.slice(0, 16)}...</div>
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">名额</div>
        {!invite.configured ? (
          <StatusPill tone="warning">已移除</StatusPill>
        ) : invite.remainingRedemptions <= 0 ? (
          <StatusPill tone="warning">{invite.redeemedCount}/{invite.maxRedemptions}</StatusPill>
        ) : (
          <StatusPill tone="good">{invite.redeemedCount}/{invite.maxRedemptions}</StatusPill>
        )}
        {invite.editable ? (
          <div className="mt-2 flex items-center gap-2">
            <Input
              className="h-8 w-20 text-[13px]"
              type="number"
              min="1"
              step="1"
              value={maxDraft}
              onChange={(event) => onMaxDraftChange(event.target.value)}
            />
            <Button
              aria-label="保存邀请码名额"
              className="h-8 w-8 p-0"
              type="button"
              size="sm"
              variant="outline"
              disabled={!canSaveMax}
              onClick={onSaveMax}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : invite.source === "env" ? (
          <div className="mt-1 text-[11px] text-muted-foreground">环境变量</div>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="md:hidden text-[11px] text-muted-foreground">最近用户</div>
        <div className="truncate">{redeemedLabel}</div>
        {invite.configured ? null : (
          <div className="mt-1 text-[11px] text-muted-foreground">当前环境变量中不存在。</div>
        )}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">最近使用</div>
        {formatDate(latestRedemption?.redeemedAt ?? null)}
      </div>
    </div>
  )
}

function createInviteMaxDrafts(invites: AdminInviteOverview[]): Record<string, string> {
  return Object.fromEntries(invites.map((invite) => [invite.codeHash, String(invite.maxRedemptions)]))
}

function createBillingAdjustmentDrafts(users: AdminUserOverview[]): Record<string, string> {
  return Object.fromEntries(users.map((user) => [user.id, "0"]))
}

function createBillingPricingDraft(pricing: BillingPricing): BillingPricing {
  return {
    promptCacheHitPricePerMillionCny: pricing.promptCacheHitPricePerMillionCny,
    promptCacheMissPricePerMillionCny: pricing.promptCacheMissPricePerMillionCny,
    outputPricePerMillionCny: pricing.outputPricePerMillionCny,
  }
}

function formatPricingSummary(pricing: BillingPricing): string {
  return [
    `缓存 ${formatMoney(pricing.promptCacheHitPricePerMillionCny)}`,
    `读入 ${formatMoney(pricing.promptCacheMissPricePerMillionCny)}`,
    `输出 ${formatMoney(pricing.outputPricePerMillionCny)}`,
  ].join(" / ")
}

function getInviteSlotCount(invites: AdminInviteOverview[]): number {
  return invites
    .filter((invite) => invite.configured)
    .reduce((sum, invite) => sum + invite.maxRedemptions, 0)
}

function replaceInviteInOverview(
  overview: AdminOverviewPayload,
  updatedInvite: AdminInviteOverview,
): AdminOverviewPayload {
  const invites = overview.auth.invites.map((invite) =>
    invite.codeHash === updatedInvite.codeHash ? updatedInvite : invite
  )
  return {
    ...overview,
    auth: {
      ...overview.auth,
      inviteSlotCount: getInviteSlotCount(invites),
      invites,
    },
  }
}

export function AdminPanel() {
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [apiDebugLogEnabledDraft, setApiDebugLogEnabledDraft] = useState(false)
  const [apiDebugLogSaving, setApiDebugLogSaving] = useState(false)
  const [apiDebugLogMessage, setApiDebugLogMessage] = useState<string | null>(null)
  const [apiDebugLogError, setApiDebugLogError] = useState<string | null>(null)
  const [billingPlatformEnabledDraft, setBillingPlatformEnabledDraft] = useState(false)
  const [billingPricingDraft, setBillingPricingDraft] = useState<BillingPricing | null>(null)
  const [billingSettingsSaving, setBillingSettingsSaving] = useState(false)
  const [billingSettingsMessage, setBillingSettingsMessage] = useState<string | null>(null)
  const [billingSettingsError, setBillingSettingsError] = useState<string | null>(null)
  const [platformDraft, setPlatformDraft] = useState(defaultPlatformDraft)
  const [platformKeySaving, setPlatformKeySaving] = useState(false)
  const [platformKeyTesting, setPlatformKeyTesting] = useState(false)
  const [platformKeyActivatingId, setPlatformKeyActivatingId] = useState<string | null>(null)
  const [platformKeyClearingId, setPlatformKeyClearingId] = useState<string | null>(null)
  const [platformKeyMessage, setPlatformKeyMessage] = useState<string | null>(null)
  const [platformKeyError, setPlatformKeyError] = useState<string | null>(null)
  const [billingAdjustmentDrafts, setBillingAdjustmentDrafts] = useState<Record<string, string>>({})
  const [billingAdjustmentSavingId, setBillingAdjustmentSavingId] = useState<string | null>(null)
  const [billingAdjustmentMessage, setBillingAdjustmentMessage] = useState<string | null>(null)
  const [billingAdjustmentError, setBillingAdjustmentError] = useState<string | null>(null)
  const [inviteCreateMax, setInviteCreateMax] = useState(String(DEFAULT_INVITE_MAX_REDEMPTIONS))
  const [inviteMaxDrafts, setInviteMaxDrafts] = useState<Record<string, string>>({})
  const [inviteCreating, setInviteCreating] = useState(false)
  const [inviteUpdatingHash, setInviteUpdatingHash] = useState<string | null>(null)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  async function loadOverview(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    setAccessDenied(false)
    try {
      const nextOverview = await getAdminOverview()
      setOverview(nextOverview)
      setApiDebugLogEnabledDraft(nextOverview.debug.apiDebugLog.runtimeEnabled)
      setBillingPlatformEnabledDraft(nextOverview.billing.settings.platformEnabled)
      setBillingPricingDraft(createBillingPricingDraft(nextOverview.billing.settings.pricing))
      setBillingAdjustmentDrafts(createBillingAdjustmentDrafts(nextOverview.users))
      setInviteMaxDrafts(createInviteMaxDrafts(nextOverview.auth.invites))
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        setAccessDenied(true)
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function saveApiDebugLogSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (apiDebugLogSaving || overview?.debug.apiDebugLog.envEnabled) return
    setApiDebugLogSaving(true)
    setApiDebugLogError(null)
    setApiDebugLogMessage(null)
    try {
      const apiDebugLog = await updateAdminApiDebugLogSettings({
        enabled: apiDebugLogEnabledDraft,
      })
      setApiDebugLogEnabledDraft(apiDebugLog.runtimeEnabled)
      setOverview((current) => current ? {
        ...current,
        debug: {
          ...current.debug,
          apiDebugLog,
        },
      } : current)
      setApiDebugLogMessage(apiDebugLog.enabled ? "调试日志已开启。" : "调试日志已关闭。")
    } catch (err) {
      setApiDebugLogError(getErrorMessage(err))
    } finally {
      setApiDebugLogSaving(false)
    }
  }

  async function saveBillingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!billingPricingDraft || billingSettingsSaving) return
    setBillingSettingsSaving(true)
    setBillingSettingsError(null)
    setBillingSettingsMessage(null)
    try {
      const billing = await updateAdminBillingSettings({
        platformEnabled: billingPlatformEnabledDraft,
        pricing: billingPricingDraft,
      })
      setBillingPlatformEnabledDraft(billing.settings.platformEnabled)
      setBillingPricingDraft(createBillingPricingDraft(billing.settings.pricing))
      setOverview((current) => current ? {
        ...current,
        llm: {
          ...current.llm,
          platformBalanceEnabled: billing.platformApiKeyConfigured && billing.settings.platformEnabled,
        },
        billing,
      } : current)
      setBillingSettingsMessage("余额设置已保存。")
    } catch (err) {
      setBillingSettingsError(getErrorMessage(err))
    } finally {
      setBillingSettingsSaving(false)
    }
  }

  async function savePlatformKey() {
    if (platformKeySaving) return
    setPlatformKeySaving(true)
    setPlatformKeyError(null)
    setPlatformKeyMessage(null)
    try {
      await saveAdminPlatformKey({
        id: platformDraft.id || undefined,
        label: platformDraft.label,
        provider: platformDraft.provider,
        baseUrl: platformDraft.baseUrl,
        modelId: platformDraft.modelId,
        pricing: platformDraft.pricing,
        apiKey: platformDraft.apiKey || undefined,
        setActive: platformDraft.setActive,
      })
      setPlatformDraft(defaultPlatformDraft(billingPricingDraft ?? undefined))
      setPlatformKeyMessage("平台模型配置已保存。")
      await loadOverview(true)
    } catch (err) {
      setPlatformKeyError(getErrorMessage(err))
    } finally {
      setPlatformKeySaving(false)
    }
  }

  async function testPlatformKey() {
    if (platformKeyTesting) return
    setPlatformKeyTesting(true)
    setPlatformKeyError(null)
    setPlatformKeyMessage(null)
    try {
      const result = await testAdminPlatformKey({
        id: platformDraft.id || undefined,
        label: platformDraft.label,
        provider: platformDraft.provider,
        baseUrl: platformDraft.baseUrl,
        modelId: platformDraft.modelId,
        apiKey: platformDraft.apiKey || undefined,
      })
      setPlatformKeyMessage(`平台模型配置测试通过：${result.provider} / ${result.model}`)
    } catch (err) {
      setPlatformKeyError(getErrorMessage(err))
    } finally {
      setPlatformKeyTesting(false)
    }
  }

  async function clearPlatformKey(providerId: string) {
    if (platformKeyClearingId) return
    setPlatformKeyClearingId(providerId)
    setPlatformKeyError(null)
    setPlatformKeyMessage(null)
    try {
      await clearAdminPlatformKey({ id: providerId })
      if (platformDraft.id === providerId) setPlatformDraft(defaultPlatformDraft(billingPricingDraft ?? undefined))
      setPlatformKeyMessage("平台模型配置已删除。")
      await loadOverview(true)
    } catch (err) {
      setPlatformKeyError(getErrorMessage(err))
    } finally {
      setPlatformKeyClearingId(null)
    }
  }

  async function activatePlatformProvider(provider: BillingPlatformProvider) {
    if (platformKeyActivatingId || provider.source === "environment") return
    setPlatformKeyActivatingId(provider.id)
    setPlatformKeyError(null)
    setPlatformKeyMessage(null)
    try {
      await saveAdminPlatformKey({
        id: provider.id,
        label: provider.label,
        provider: provider.provider,
        baseUrl: provider.baseUrl,
        modelId: provider.modelId,
        pricing: provider.pricing,
        setActive: true,
      })
      setPlatformKeyMessage("余额通道已切换。")
      await loadOverview(true)
    } catch (err) {
      setPlatformKeyError(getErrorMessage(err))
    } finally {
      setPlatformKeyActivatingId(null)
    }
  }

  async function saveBillingAdjustment(user: AdminUserOverview) {
    if (billingAdjustmentSavingId) return
    const amountCny = Number(billingAdjustmentDrafts[user.id])
    if (!Number.isFinite(amountCny) || amountCny === 0) {
      setBillingAdjustmentMessage(null)
      setBillingAdjustmentError("请输入非零调整金额。")
      return
    }

    setBillingAdjustmentSavingId(user.id)
    setBillingAdjustmentMessage(null)
    setBillingAdjustmentError(null)
    try {
      await adjustAdminBillingBalance({
        userId: user.id,
        amountCny,
        note: amountCny > 0 ? "管理员充值" : "管理员扣减",
      })
      setBillingAdjustmentDrafts((current) => ({ ...current, [user.id]: "0" }))
      setBillingAdjustmentMessage("余额已调整。")
      await loadOverview(true)
    } catch (err) {
      setBillingAdjustmentError(getErrorMessage(err))
    } finally {
      setBillingAdjustmentSavingId(null)
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inviteCreating) return
    setInviteCreating(true)
    setInviteMessage(null)
    setInviteError(null)
    try {
      const invite = await createAdminInvite({ maxRedemptions: Number(inviteCreateMax) })
      setOverview((current) => current ? {
        ...current,
        auth: {
          ...current.auth,
          inviteCodeCount: current.auth.inviteCodeCount + 1,
          inviteSlotCount: current.auth.inviteSlotCount + invite.maxRedemptions,
          invites: [invite, ...current.auth.invites],
        },
      } : current)
      setInviteMaxDrafts((current) => ({
        ...current,
        [invite.codeHash]: String(invite.maxRedemptions),
      }))
      setInviteMessage(`已创建 ${invite.code}`)
    } catch (err) {
      setInviteError(getErrorMessage(err))
    } finally {
      setInviteCreating(false)
    }
  }

  async function saveInviteMax(invite: AdminInviteOverview) {
    if (inviteUpdatingHash) return
    setInviteUpdatingHash(invite.codeHash)
    setInviteMessage(null)
    setInviteError(null)
    try {
      const updatedInvite = await updateAdminInvite(invite.codeHash, {
        maxRedemptions: Number(inviteMaxDrafts[invite.codeHash] ?? invite.maxRedemptions),
      })
      setOverview((current) => current ? replaceInviteInOverview(current, updatedInvite) : current)
      setInviteMaxDrafts((current) => ({
        ...current,
        [updatedInvite.codeHash]: String(updatedInvite.maxRedemptions),
      }))
      setInviteMessage("邀请码名额已保存。")
    } catch (err) {
      setInviteError(getErrorMessage(err))
    } finally {
      setInviteUpdatingHash(null)
    }
  }

  function updateBillingPricingDraft<K extends keyof BillingPricing>(
    key: K,
    value: BillingPricing[K],
  ) {
    setBillingPricingDraft((current) => current ? { ...current, [key]: value } : current)
  }

  function updatePlatformDraft<K extends keyof ReturnType<typeof defaultPlatformDraft>>(
    key: K,
    value: ReturnType<typeof defaultPlatformDraft>[K],
  ) {
    setPlatformDraft((current) => ({ ...current, [key]: value }))
  }

  function updatePlatformDraftPricing<K extends keyof BillingPricing>(
    key: K,
    value: BillingPricing[K],
  ) {
    setPlatformDraft((current) => ({
      ...current,
      pricing: { ...current.pricing, [key]: value },
    }))
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const sortedUsers = useMemo(() => {
    return [...(overview?.users ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [overview?.users])
  const billingUsageByUserId = useMemo(() => {
    return new Map((overview?.billing.byUser ?? []).map((usage) => [usage.userId, usage]))
  }, [overview?.billing.byUser])
  const inviteSlotCount = overview?.auth.inviteSlotCount ?? 0

  if (loading) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/75 p-5 text-sm text-muted-foreground">
        正在加载管理后台数据...
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-800 dark:text-amber-200">当前账号无法访问管理后台。</div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              将当前登录邮箱加入 LG_ADMIN_EMAILS，重启服务后再打开管理后台。
            </p>
            <pre className="mt-4 overflow-x-auto rounded-md border border-border/70 bg-background p-3 text-[12px] leading-relaxed">
              <code>LG_ADMIN_EMAILS=your-email@example.com</code>
            </pre>
            <Button className="mt-4" size="sm" variant="outline" asChild>
              <Link href="/">返回应用</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-destructive">{error}</div>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => void loadOverview()}>
              <RefreshCw className="h-4 w-4" />
              重试
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!overview) return null

  const billingSettingsCanSave = Boolean(billingPricingDraft) &&
    !billingSettingsSaving &&
    (
      billingPlatformEnabledDraft !== overview.billing.settings.platformEnabled ||
      billingPricingDraft?.promptCacheHitPricePerMillionCny !== overview.billing.settings.pricing.promptCacheHitPricePerMillionCny ||
      billingPricingDraft?.promptCacheMissPricePerMillionCny !== overview.billing.settings.pricing.promptCacheMissPricePerMillionCny ||
      billingPricingDraft?.outputPricePerMillionCny !== overview.billing.settings.pricing.outputPricePerMillionCny
    )
  const activePlatformLabel = formatActivePlatformProvider(overview.billing.activePlatformProvider)
  const activePlatformSourceLabel = formatActivePlatformSource(
    overview.billing.platformKeySource,
    overview.billing.platformKeyPreview,
  )
  const platformDraftExisting = platformDraft.id
    ? overview.billing.platformProviders.find((provider) => provider.id === platformDraft.id)
    : null
  const platformDraftCanTest = Boolean(platformDraft.apiKey.trim() || platformDraftExisting?.configured)
  const apiDebugLog = overview.debug.apiDebugLog
  const apiDebugLogCanSave = !apiDebugLogSaving &&
    !apiDebugLog.envEnabled &&
    apiDebugLogEnabledDraft !== apiDebugLog.runtimeEnabled
  const apiDebugLogSourceLabel = formatApiDebugLogSource(apiDebugLog.source)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-muted-foreground">
          已刷新 {formatDate(overview.generatedAt)}
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadOverview(true)} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          刷新
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile icon={Users} label="用户" value={`${overview.auth.userCount}`} />
        <SummaryTile icon={Ticket} label="邀请名额" value={`${overview.auth.redeemedInviteCount}/${inviteSlotCount}`} />
        <SummaryTile icon={KeyRound} label="活跃会话" value={`${overview.auth.activeSessionCount}`} />
        <SummaryTile icon={HardDrive} label="用户数据" value={formatBytes(overview.storage.totalUserDataBytes)} />
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={overview.llm.userKeyModeEnabled ? "good" : "warning"}>用户自备 Key 模式</StatusPill>
          <StatusPill tone={overview.llm.platformBalanceEnabled ? "good" : "warning"}>
            {overview.llm.platformBalanceEnabled ? "平台余额可用" : "平台余额不可用"}
          </StatusPill>
          <StatusPill tone={apiDebugLog.enabled ? "warning" : "neutral"}>
            {apiDebugLog.enabled ? "API 调试日志开启" : "API 调试日志关闭"}
          </StatusPill>
          <StatusPill>总余额 {formatMoney(overview.billing.total.balanceCny)} CNY</StatusPill>
          <StatusPill>已用余额 {formatMoney(overview.billing.total.usedBalanceCny)} CNY</StatusPill>
          <StatusPill tone={overview.auth.adminEmailCount > 0 ? "good" : "warning"}>管理员 {overview.auth.adminEmailCount}</StatusPill>
        </div>
        <div className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all font-mono">{overview.dataRoot}</span>
        </div>
        <div className="mt-2 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Bug className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all font-mono">{apiDebugLog.logFile}</span>
        </div>
        <form className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3" onSubmit={saveApiDebugLogSettings}>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={apiDebugLog.envEnabled || apiDebugLogEnabledDraft}
              disabled={apiDebugLog.envEnabled}
              onChange={(event) => setApiDebugLogEnabledDraft(event.target.checked)}
              className="h-4 w-4"
            />
            记录模型 API 调试日志
          </label>
          <StatusPill tone={apiDebugLog.enabled ? "warning" : "neutral"}>{apiDebugLogSourceLabel}</StatusPill>
          <Button type="submit" size="sm" disabled={!apiDebugLogCanSave}>
            <Save className={cn("h-4 w-4", apiDebugLogSaving && "animate-pulse")} />
            {apiDebugLogSaving ? "保存中..." : "保存调试开关"}
          </Button>
          {apiDebugLog.enabled ? (
            <span className="text-[12px] text-amber-700 dark:text-amber-300">会记录完整 prompt，用完请关闭。</span>
          ) : null}
          {apiDebugLogMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{apiDebugLogMessage}</span> : null}
          {apiDebugLogError ? <span className="text-[12px] text-destructive">{apiDebugLogError}</span> : null}
        </form>
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-normal">平台余额</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              管理余额开关、平台模型配置、配置内单价和用户余额调整；余额扣费按当前启用配置的价格计算。
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusPill tone={overview.billing.settings.platformEnabled ? "good" : "warning"}>
            {overview.billing.settings.platformEnabled ? "余额通道已开启" : "余额通道已关闭"}
          </StatusPill>
          <StatusPill tone={overview.billing.platformApiKeyConfigured ? "good" : "warning"}>
            当前启用：{activePlatformLabel}
          </StatusPill>
          <StatusPill>
            来源：{activePlatformSourceLabel}
          </StatusPill>
          <StatusPill>总额 {formatMoney(overview.billing.total.balanceCny)} CNY</StatusPill>
          <StatusPill>已用 {formatMoney(overview.billing.total.usedBalanceCny)} CNY</StatusPill>
          <StatusPill tone={overview.llm.platformBalanceEnabled ? "good" : "warning"}>
            {overview.llm.platformBalanceEnabled ? "余额调用可用" : "余额调用不可用"}
          </StatusPill>
        </div>

        {billingPricingDraft ? (
          <form className="space-y-4" onSubmit={saveBillingSettings}>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={billingPlatformEnabledDraft}
                onChange={(event) => setBillingPlatformEnabledDraft(event.target.checked)}
                className="h-4 w-4"
              />
              启用平台余额调用
            </label>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              下方价格仅作为新建平台配置和旧配置迁移的默认值；每个模型配置可单独设置价格。
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              <MoneyNumberInput
                label="默认缓存命中单价"
                value={billingPricingDraft.promptCacheHitPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updateBillingPricingDraft("promptCacheHitPricePerMillionCny", value)}
              />
              <MoneyNumberInput
                label="默认读入单价"
                value={billingPricingDraft.promptCacheMissPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updateBillingPricingDraft("promptCacheMissPricePerMillionCny", value)}
              />
              <MoneyNumberInput
                label="默认输出单价"
                value={billingPricingDraft.outputPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updateBillingPricingDraft("outputPricePerMillionCny", value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={!billingSettingsCanSave}>
                <Save className="h-4 w-4" />
                {billingSettingsSaving ? "保存中..." : "保存余额开关/默认价格"}
              </Button>
              {billingSettingsMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{billingSettingsMessage}</span> : null}
              {billingSettingsError ? <span className="text-[12px] text-destructive">{billingSettingsError}</span> : null}
            </div>
          </form>
        ) : null}

        <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[13px] font-medium text-foreground">平台模型配置</h3>
            <Button type="button" size="sm" variant="outline" onClick={() => setPlatformDraft(defaultPlatformDraft(billingPricingDraft ?? undefined))}>
              <Plus className="h-4 w-4" />
              新增配置
            </Button>
          </div>

          <div className="grid gap-2">
            {overview.billing.platformProviders.length ? overview.billing.platformProviders.map((provider) => {
              const active = overview.billing.activePlatformProviderId === provider.id
              const deleting = platformKeyClearingId === provider.id
              const activating = platformKeyActivatingId === provider.id
              return (
                <div
                  key={`${provider.source}:${provider.id}`}
                  className={cn(
                    "grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center",
                    active ? "border-primary/55 bg-primary/5" : "border-border/70 bg-background",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground">{provider.label}</span>
                      {active ? <StatusPill tone="good">当前启用</StatusPill> : <StatusPill>备用</StatusPill>}
                      <StatusPill tone={provider.configured ? "good" : "warning"}>{provider.configured ? "Key 已配置" : "缺少 Key"}</StatusPill>
                      <StatusPill>来源：{formatPlatformProviderSource(provider.source)}</StatusPill>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {provider.provider} / {provider.modelId}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{provider.baseUrl}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      价格 CNY / 1M：{formatPricingSummary(provider.pricing)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={provider.source === "environment"}
                      onClick={() => setPlatformDraft(platformDraftFromProvider(provider))}
                    >
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={provider.source === "environment" || active || Boolean(platformKeyActivatingId)}
                      onClick={() => void activatePlatformProvider(provider)}
                    >
                      {activating ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                      {active ? "已启用" : "启用"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={provider.source === "environment" || deleting}
                      onClick={() => void clearPlatformKey(provider.id)}
                    >
                      {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      删除
                    </Button>
                  </div>
                </div>
              )
            }) : (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
                暂无平台模型配置
              </div>
            )}
          </div>

          <div className="grid gap-3 rounded-lg border border-border/70 bg-background p-3">
            <div className="text-[12px] font-medium text-muted-foreground">
              {platformDraft.id ? "编辑平台配置" : "新增平台配置"}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">名称</span>
                <Input value={platformDraft.label} onChange={(event) => updatePlatformDraft("label", event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">供应商标识</span>
                <Input value={platformDraft.provider} onChange={(event) => updatePlatformDraft("provider", event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">Base URL</span>
                <Input type="url" value={platformDraft.baseUrl} onChange={(event) => updatePlatformDraft("baseUrl", event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-muted-foreground">模型 ID</span>
                <Input value={platformDraft.modelId} onChange={(event) => updatePlatformDraft("modelId", event.target.value)} />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">API Key</span>
              <Input
                type="password"
                autoComplete="off"
                value={platformDraft.apiKey}
                onChange={(event) => updatePlatformDraft("apiKey", event.target.value)}
                placeholder={platformDraft.id ? "留空则不更新 Key" : "sk-..."}
              />
            </label>
            <div className="grid gap-2 md:grid-cols-3">
              <MoneyNumberInput
                label="缓存命中输入单价"
                value={platformDraft.pricing.promptCacheHitPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updatePlatformDraftPricing("promptCacheHitPricePerMillionCny", value)}
              />
              <MoneyNumberInput
                label="读入输入单价"
                value={platformDraft.pricing.promptCacheMissPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updatePlatformDraftPricing("promptCacheMissPricePerMillionCny", value)}
              />
              <MoneyNumberInput
                label="输出 token 单价"
                value={platformDraft.pricing.outputPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updatePlatformDraftPricing("outputPricePerMillionCny", value)}
              />
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={platformDraft.setActive}
                onChange={(event) => updatePlatformDraft("setActive", event.target.checked)}
                className="h-4 w-4"
              />
              保存后立即启用为余额通道
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={platformKeySaving || (!platformDraft.id && !platformDraft.apiKey.trim())}
                onClick={() => void savePlatformKey()}
              >
                <Save className={cn("h-4 w-4", platformKeySaving && "animate-pulse")} />
                保存配置
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={platformKeyTesting || !platformDraftCanTest}
                onClick={() => void testPlatformKey()}
              >
                <PlugZap className={cn("h-4 w-4", platformKeyTesting && "animate-pulse")} />
                测试
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-2 min-h-5 text-[12px] leading-relaxed">
          {platformKeyMessage ? <span className="text-emerald-700 dark:text-emerald-300">{platformKeyMessage}</span> : null}
          {platformKeyError ? <span className="text-destructive">{platformKeyError}</span> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-normal">邀请码</h2>
          <span className="text-[12px] text-muted-foreground">共 {overview.auth.invites.length} 个</span>
        </div>
        <form className="flex flex-wrap items-end gap-3 border-t border-border/60 px-4 py-3" onSubmit={createInvite}>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">最大使用次数</span>
            <Input
              className="w-28"
              type="number"
              min="1"
              step="1"
              value={inviteCreateMax}
              onChange={(event) => setInviteCreateMax(event.target.value)}
            />
          </label>
          <Button type="submit" size="sm" disabled={inviteCreating}>
            <Plus className="h-4 w-4" />
            {inviteCreating ? "创建中..." : "创建邀请码"}
          </Button>
          {inviteMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{inviteMessage}</span> : null}
          {inviteError ? <span className="text-[12px] text-destructive">{inviteError}</span> : null}
        </form>
        <div className="hidden border-t border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground md:grid md:grid-cols-[minmax(180px,1fr)_168px_minmax(200px,1fr)_120px]">
          <div>邀请码</div>
          <div>名额</div>
          <div>最近用户</div>
          <div>最近使用</div>
        </div>
        {overview.auth.invites.length > 0 ? (
          overview.auth.invites.map((invite) => (
            <InviteRow
              key={`${invite.codeHash}-${invite.configured}`}
              invite={invite}
              maxDraft={inviteMaxDrafts[invite.codeHash] ?? String(invite.maxRedemptions)}
              saving={inviteUpdatingHash === invite.codeHash}
              onMaxDraftChange={(value) => setInviteMaxDrafts((current) => ({
                ...current,
                [invite.codeHash]: value,
              }))}
              onSaveMax={() => void saveInviteMax(invite)}
            />
          ))
        ) : (
          <div className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            暂无邀请码。
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold tracking-normal">用户</h2>
            {billingAdjustmentMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{billingAdjustmentMessage}</span> : null}
            {billingAdjustmentError ? <span className="text-[12px] text-destructive">{billingAdjustmentError}</span> : null}
          </div>
          <span className="text-[12px] text-muted-foreground">共 {sortedUsers.length} 个</span>
        </div>
        <div className="hidden border-t border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground lg:grid lg:grid-cols-[minmax(220px,1.4fr)_72px_88px_96px_132px_132px_116px_112px]">
          <div>账号</div>
          <div>书籍</div>
          <div>数据</div>
          <div>模型 Key</div>
          <div>余额</div>
          <div>调整</div>
          <div>会话</div>
          <div>最近数据</div>
        </div>
        {sortedUsers.length > 0 ? (
          sortedUsers.map((user) => {
            const billingAdjustmentDraft = billingAdjustmentDrafts[user.id] ?? "0"
            const billingAdjustmentNumber = Number(billingAdjustmentDraft)
            const billingCanSave = billingAdjustmentSavingId === null &&
              Number.isFinite(billingAdjustmentNumber) &&
              billingAdjustmentNumber !== 0

            return (
              <UserRow
                key={user.id}
                user={user}
                billingUsage={billingUsageByUserId.get(user.id)}
                billingAdjustmentDraft={billingAdjustmentDraft}
                billingSaving={billingAdjustmentSavingId === user.id}
                billingCanSave={billingCanSave}
                onBillingAdjustmentDraftChange={(value) => setBillingAdjustmentDrafts((current) => ({
                  ...current,
                  [user.id]: value,
                }))}
                onSaveBillingAdjustment={() => void saveBillingAdjustment(user)}
              />
            )
          })
        ) : (
          <div className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            暂无用户。
          </div>
        )}
      </section>
    </div>
  )
}
