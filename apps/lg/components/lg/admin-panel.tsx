"use client"

import type { FormEvent, ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
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
  updateAdminBillingSettings,
  updateAdminInvite,
  type AdminInviteOverview,
  type AdminOverviewPayload,
  type AdminUserOverview,
} from "@/lib/api"
import type { BillingPricing, BillingUserSummary } from "@/lib/billing"
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
  return error instanceof Error && error.message ? error.message : "Admin data failed to load"
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
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0"
          step="0.000001"
          value={Number.isFinite(value) ? String(value) : "0"}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{suffix}</span>
      </div>
    </label>
  )
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
        <div className="lg:hidden text-[11px] text-muted-foreground">Books</div>
        {user.booksCount}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">Data</div>
        {formatBytes(user.dataBytes)}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">Model key</div>
        {user.hasPersonalDeepSeekKey ? (
          <StatusPill tone="good">{user.deepSeekKeyPreview ?? "Configured"}</StatusPill>
        ) : (
          <StatusPill tone="warning">Missing</StatusPill>
        )}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">Balance</div>
        <span>{formatMoney(balanceCny)}</span>
        {usedBalanceCny > 0 ? (
          <span className="ml-1 text-muted-foreground">used {formatMoney(usedBalanceCny)}</span>
        ) : null}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">Adjust</div>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-24 text-[13px]"
            type="number"
            step="0.000001"
            value={billingAdjustmentDraft}
            onChange={(event) => onBillingAdjustmentDraftChange(event.target.value)}
          />
          <Button
            aria-label={`Adjust balance for ${user.email}`}
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
        <div className="mt-1 text-[11px] text-muted-foreground">Positive credits, negative debits.</div>
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">Session</div>
        <span>{user.activeSessionCount} active</span>
        {user.expiredSessionCount > 0 ? (
          <span className="ml-1 text-muted-foreground">/ {user.expiredSessionCount} expired</span>
        ) : null}
      </div>
      <div>
        <div className="lg:hidden text-[11px] text-muted-foreground">Recent data</div>
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
    ? `${latestRedemption.email ?? latestRedemption.userId}${invite.redeemedCount > 1 ? ` and ${invite.redeemedCount - 1} more` : ""}`
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
        <div className="truncate font-mono">{invite.code ?? "Removed invite"}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{invite.codeHash.slice(0, 16)}...</div>
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">Slots</div>
        {!invite.configured ? (
          <StatusPill tone="warning">Removed</StatusPill>
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
              aria-label="Save invite slots"
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
          <div className="mt-1 text-[11px] text-muted-foreground">Env var</div>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="md:hidden text-[11px] text-muted-foreground">Latest user</div>
        <div className="truncate">{redeemedLabel}</div>
        {invite.configured ? null : (
          <div className="mt-1 text-[11px] text-muted-foreground">Not present in current env vars.</div>
        )}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">Latest use</div>
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
  const [billingPlatformEnabledDraft, setBillingPlatformEnabledDraft] = useState(false)
  const [billingPricingDraft, setBillingPricingDraft] = useState<BillingPricing | null>(null)
  const [billingSettingsSaving, setBillingSettingsSaving] = useState(false)
  const [billingSettingsMessage, setBillingSettingsMessage] = useState<string | null>(null)
  const [billingSettingsError, setBillingSettingsError] = useState<string | null>(null)
  const [platformKeyDraft, setPlatformKeyDraft] = useState("")
  const [platformKeySaving, setPlatformKeySaving] = useState(false)
  const [platformKeyTesting, setPlatformKeyTesting] = useState(false)
  const [platformKeyClearing, setPlatformKeyClearing] = useState(false)
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
      setBillingSettingsMessage("Balance settings saved.")
    } catch (err) {
      setBillingSettingsError(getErrorMessage(err))
    } finally {
      setBillingSettingsSaving(false)
    }
  }

  async function savePlatformKey() {
    const apiKey = platformKeyDraft.trim()
    if (!apiKey || platformKeySaving) return
    setPlatformKeySaving(true)
    setPlatformKeyError(null)
    setPlatformKeyMessage(null)
    try {
      await saveAdminPlatformKey({ apiKey })
      setPlatformKeyDraft("")
      setPlatformKeyMessage("Platform API key saved.")
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
      const result = await testAdminPlatformKey(platformKeyDraft.trim() ? { apiKey: platformKeyDraft.trim() } : {})
      setPlatformKeyMessage(`Platform API key test passed: ${result.model}`)
    } catch (err) {
      setPlatformKeyError(getErrorMessage(err))
    } finally {
      setPlatformKeyTesting(false)
    }
  }

  async function clearPlatformKey() {
    if (platformKeyClearing) return
    setPlatformKeyClearing(true)
    setPlatformKeyError(null)
    setPlatformKeyMessage(null)
    try {
      await clearAdminPlatformKey()
      setPlatformKeyDraft("")
      setPlatformKeyMessage("Saved platform API key cleared.")
      await loadOverview(true)
    } catch (err) {
      setPlatformKeyError(getErrorMessage(err))
    } finally {
      setPlatformKeyClearing(false)
    }
  }

  async function saveBillingAdjustment(user: AdminUserOverview) {
    if (billingAdjustmentSavingId) return
    const amountCny = Number(billingAdjustmentDrafts[user.id])
    if (!Number.isFinite(amountCny) || amountCny === 0) {
      setBillingAdjustmentMessage(null)
      setBillingAdjustmentError("Enter a non-zero adjustment amount.")
      return
    }

    setBillingAdjustmentSavingId(user.id)
    setBillingAdjustmentMessage(null)
    setBillingAdjustmentError(null)
    try {
      await adjustAdminBillingBalance({
        userId: user.id,
        amountCny,
        note: amountCny > 0 ? "admin credit" : "admin debit",
      })
      setBillingAdjustmentDrafts((current) => ({ ...current, [user.id]: "0" }))
      setBillingAdjustmentMessage("Balance adjusted.")
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
      setInviteMessage(`Created ${invite.code}`)
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
      setInviteMessage("Invite slots saved.")
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
        Loading admin data...
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-800 dark:text-amber-200">This account cannot access admin.</div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Add the current login email to LG_ADMIN_EMAILS, restart the server, and open admin again.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-md border border-border/70 bg-background p-3 text-[12px] leading-relaxed">
              <code>LG_ADMIN_EMAILS=your-email@example.com</code>
            </pre>
            <Button className="mt-4" size="sm" variant="outline" asChild>
              <Link href="/">Back to app</Link>
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
              Retry
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
  const platformKeySourceLabel = overview.billing.platformKeySource === "environment"
    ? "env var"
    : overview.billing.platformKeySource === "admin"
      ? `admin saved ${overview.billing.platformKeyPreview ?? ""}`.trim()
      : "not configured"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-muted-foreground">
          Refreshed {formatDate(overview.generatedAt)}
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadOverview(true)} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile icon={Users} label="Users" value={`${overview.auth.userCount}`} />
        <SummaryTile icon={Ticket} label="Invite slots" value={`${overview.auth.redeemedInviteCount}/${inviteSlotCount}`} />
        <SummaryTile icon={KeyRound} label="Active sessions" value={`${overview.auth.activeSessionCount}`} />
        <SummaryTile icon={HardDrive} label="User data" value={formatBytes(overview.storage.totalUserDataBytes)} />
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={overview.llm.userKeyModeEnabled ? "good" : "warning"}>User key mode</StatusPill>
          <StatusPill tone={overview.llm.platformBalanceEnabled ? "good" : "warning"}>
            {overview.llm.platformBalanceEnabled ? "Platform balance available" : "Platform balance unavailable"}
          </StatusPill>
          <StatusPill>Total balance {formatMoney(overview.billing.total.balanceCny)} CNY</StatusPill>
          <StatusPill>Used balance {formatMoney(overview.billing.total.usedBalanceCny)} CNY</StatusPill>
          <StatusPill tone={overview.auth.adminEmailCount > 0 ? "good" : "warning"}>Admins {overview.auth.adminEmailCount}</StatusPill>
        </div>
        <div className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all font-mono">{overview.dataRoot}</span>
        </div>
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-normal">Platform balance</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Manage the global balance switch, platform DeepSeek API key, pricing, and per-user balance adjustments.
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusPill tone={overview.billing.settings.platformEnabled ? "good" : "warning"}>
            {overview.billing.settings.platformEnabled ? "Balance channel enabled" : "Balance channel disabled"}
          </StatusPill>
          <StatusPill tone={overview.billing.platformApiKeyConfigured ? "good" : "warning"}>
            Platform key: {platformKeySourceLabel}
          </StatusPill>
          <StatusPill>Total {formatMoney(overview.billing.total.balanceCny)} CNY</StatusPill>
          <StatusPill>Used {formatMoney(overview.billing.total.usedBalanceCny)} CNY</StatusPill>
          <StatusPill tone={overview.llm.platformBalanceEnabled ? "good" : "warning"}>
            {overview.llm.platformBalanceEnabled ? "Balance calls available" : "Balance calls unavailable"}
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
              Enable platform balance calls
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <MoneyNumberInput
                label="Cache-hit input price"
                value={billingPricingDraft.promptCacheHitPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updateBillingPricingDraft("promptCacheHitPricePerMillionCny", value)}
              />
              <MoneyNumberInput
                label="Cache-miss input price"
                value={billingPricingDraft.promptCacheMissPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updateBillingPricingDraft("promptCacheMissPricePerMillionCny", value)}
              />
              <MoneyNumberInput
                label="Output token price"
                value={billingPricingDraft.outputPricePerMillionCny}
                suffix="CNY / 1M"
                onChange={(value) => updateBillingPricingDraft("outputPricePerMillionCny", value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={!billingSettingsCanSave}>
                <Save className="h-4 w-4" />
                {billingSettingsSaving ? "Saving..." : "Save balance settings"}
              </Button>
              {billingSettingsMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{billingSettingsMessage}</span> : null}
              {billingSettingsError ? <span className="text-[12px] text-destructive">{billingSettingsError}</span> : null}
            </div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-3 border-t border-border/60 pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">Platform DeepSeek API key</span>
            <Input
              type="password"
              autoComplete="off"
              value={platformKeyDraft}
              onChange={(event) => setPlatformKeyDraft(event.target.value)}
              placeholder="sk-..."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!platformKeyDraft.trim() || platformKeySaving} onClick={() => void savePlatformKey()}>
              <Save className={cn("h-4 w-4", platformKeySaving && "animate-pulse")} />
              Save key
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={platformKeyTesting || (!platformKeyDraft.trim() && !overview.billing.platformApiKeyConfigured)}
              onClick={() => void testPlatformKey()}
            >
              <PlugZap className={cn("h-4 w-4", platformKeyTesting && "animate-pulse")} />
              Test
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={platformKeyClearing || overview.billing.platformKeySource !== "admin"}
              onClick={() => void clearPlatformKey()}
            >
              <Trash2 className={cn("h-4 w-4", platformKeyClearing && "animate-pulse")} />
              Clear saved key
            </Button>
          </div>
        </div>
        <div className="mt-2 min-h-5 text-[12px] leading-relaxed">
          {platformKeyMessage ? <span className="text-emerald-700 dark:text-emerald-300">{platformKeyMessage}</span> : null}
          {platformKeyError ? <span className="text-destructive">{platformKeyError}</span> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-normal">Invites</h2>
          <span className="text-[12px] text-muted-foreground">{overview.auth.invites.length} total</span>
        </div>
        <form className="flex flex-wrap items-end gap-3 border-t border-border/60 px-4 py-3" onSubmit={createInvite}>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">Max redemptions</span>
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
            {inviteCreating ? "Creating..." : "Create invite"}
          </Button>
          {inviteMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{inviteMessage}</span> : null}
          {inviteError ? <span className="text-[12px] text-destructive">{inviteError}</span> : null}
        </form>
        <div className="hidden border-t border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground md:grid md:grid-cols-[minmax(180px,1fr)_168px_minmax(200px,1fr)_120px]">
          <div>Invite</div>
          <div>Slots</div>
          <div>Latest user</div>
          <div>Latest use</div>
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
            No invites.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold tracking-normal">Users</h2>
            {billingAdjustmentMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{billingAdjustmentMessage}</span> : null}
            {billingAdjustmentError ? <span className="text-[12px] text-destructive">{billingAdjustmentError}</span> : null}
          </div>
          <span className="text-[12px] text-muted-foreground">{sortedUsers.length} total</span>
        </div>
        <div className="hidden border-t border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground lg:grid lg:grid-cols-[minmax(220px,1.4fr)_72px_88px_96px_132px_132px_116px_112px]">
          <div>Account</div>
          <div>Books</div>
          <div>Data</div>
          <div>Model key</div>
          <div>Balance</div>
          <div>Adjust</div>
          <div>Session</div>
          <div>Recent data</div>
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
            No users.
          </div>
        )}
      </section>
    </div>
  )
}
