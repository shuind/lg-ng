"use client"

import type { FormEvent, ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Coins, Database, HardDrive, KeyRound, RefreshCw, Save, Ticket, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AdminApiError,
  getAdminOverview,
  updateAdminTrialQuotaSettings,
  type AdminInviteOverview,
  type AdminOverviewPayload,
  type AdminUserOverview,
  type TrialQuotaSettings,
} from "@/lib/api"
import { cn } from "@/lib/utils"

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
  if (!Number.isFinite(value)) return "0.0000"
  return value >= 1 ? value.toFixed(2) : value.toFixed(6).replace(/0+$/, "0")
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "后台数据加载失败"
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Users
  label: string
  value: string
  tone?: "default" | "warning"
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md",
          tone === "warning" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary",
        )}>
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
    <span className={cn(
      "inline-flex h-6 items-center rounded-md border px-2 text-[12px] font-medium",
      tone === "good" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      tone === "neutral" && "border-border/70 bg-background text-muted-foreground",
    )}>
      {children}
    </span>
  )
}

function UserRow({
  user,
  quotaUsage,
}: {
  user: AdminUserOverview
  quotaUsage?: { estimatedCostCny: number; requestCount: number }
}) {
  return (
    <div className="grid gap-3 border-t border-border/60 px-4 py-3 text-[13px] md:grid-cols-[minmax(220px,1.4fr)_80px_96px_96px_112px_132px_120px] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-medium">{user.email}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{user.id}</div>
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">书籍</div>
        {user.booksCount}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">数据</div>
        {formatBytes(user.dataBytes)}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">模型 Key</div>
        {user.hasPersonalDeepSeekKey ? (
          <StatusPill tone="good">{user.deepSeekKeyPreview ?? "已配置"}</StatusPill>
        ) : (
          <StatusPill tone="warning">未配置</StatusPill>
        )}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">平台额度</div>
        <span>{formatMoney(quotaUsage?.estimatedCostCny ?? 0)}</span>
        {quotaUsage?.requestCount ? (
          <span className="ml-1 text-muted-foreground">/ {quotaUsage.requestCount} 次</span>
        ) : null}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">Session</div>
        <span>{user.activeSessionCount} 活跃</span>
        {user.expiredSessionCount > 0 ? (
          <span className="ml-1 text-muted-foreground">/ {user.expiredSessionCount} 过期</span>
        ) : null}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">最近数据</div>
        {formatDate(user.dataUpdatedAt)}
      </div>
    </div>
  )
}

function InviteRow({ invite }: { invite: AdminInviteOverview }) {
  return (
    <div className="grid gap-3 border-t border-border/60 px-4 py-3 text-[13px] md:grid-cols-[minmax(180px,1fr)_96px_minmax(180px,1fr)_120px] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-mono">{invite.code ?? "已移除的邀请码"}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{invite.codeHash.slice(0, 16)}...</div>
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">状态</div>
        {invite.redeemed ? (
          <StatusPill tone="warning">已使用</StatusPill>
        ) : (
          <StatusPill tone="good">未使用</StatusPill>
        )}
      </div>
      <div className="min-w-0">
        <div className="md:hidden text-[11px] text-muted-foreground">兑换用户</div>
        <div className="truncate">{invite.redeemedByEmail ?? "-"}</div>
        {invite.configured ? null : (
          <div className="mt-1 text-[11px] text-muted-foreground">当前环境变量未配置此码</div>
        )}
      </div>
      <div>
        <div className="md:hidden text-[11px] text-muted-foreground">兑换时间</div>
        {formatDate(invite.redeemedAt)}
      </div>
    </div>
  )
}

function QuotaNumberInput({
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

export function AdminPanel() {
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [quotaDraft, setQuotaDraft] = useState<TrialQuotaSettings | null>(null)
  const [quotaSaving, setQuotaSaving] = useState(false)
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  async function loadOverview(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    setAccessDenied(false)
    try {
      const nextOverview = await getAdminOverview()
      setOverview(nextOverview)
      setQuotaDraft(nextOverview.quota.settings)
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

  async function saveQuotaSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quotaDraft || quotaSaving) return
    setQuotaSaving(true)
    setQuotaError(null)
    setQuotaMessage(null)
    try {
      const quota = await updateAdminTrialQuotaSettings(quotaDraft)
      setQuotaDraft(quota.settings)
      setOverview((current) => current ? {
        ...current,
        llm: {
          ...current.llm,
          platformQuotaEnabled: quota.enforcementEnabled,
        },
        quota,
      } : current)
      setQuotaMessage("额度设置已保存")
    } catch (err) {
      setQuotaError(getErrorMessage(err))
    } finally {
      setQuotaSaving(false)
    }
  }

  function updateQuotaDraft<K extends keyof Omit<TrialQuotaSettings, "updatedAt">>(
    key: K,
    value: TrialQuotaSettings[K],
  ) {
    setQuotaDraft((current) => current ? { ...current, [key]: value } : current)
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const sortedUsers = useMemo(() => {
    return [...(overview?.users ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [overview?.users])
  const quotaUsageByUserId = useMemo(() => {
    return new Map((overview?.quota.byUser ?? []).map((usage) => [usage.userId, usage]))
  }, [overview?.quota.byUser])

  if (loading) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/75 p-5 text-sm text-muted-foreground">
        正在加载后台数据...
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-800 dark:text-amber-200">当前账号没有后台访问权限</div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              将当前登录邮箱加入环境变量 LG_ADMIN_EMAILS 后重启服务，再重新进入后台。
            </p>
            <pre className="mt-4 overflow-x-auto rounded-md border border-border/70 bg-background p-3 text-[12px] leading-relaxed">
              <code>LG_ADMIN_EMAILS=你的邮箱</code>
            </pre>
            <Button className="mt-4" size="sm" variant="outline" asChild>
              <Link href="/">返回工作台</Link>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-muted-foreground">
          刷新于 {formatDate(overview.generatedAt)}
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadOverview(true)} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          刷新
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile icon={Users} label="用户" value={`${overview.auth.userCount}`} />
        <SummaryTile icon={Ticket} label="邀请码" value={`${overview.auth.redeemedInviteCount}/${overview.auth.inviteCodeCount}`} />
        <SummaryTile icon={KeyRound} label="活跃 Session" value={`${overview.auth.activeSessionCount}`} />
        <SummaryTile icon={HardDrive} label="用户数据" value={formatBytes(overview.storage.totalUserDataBytes)} />
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={overview.llm.userKeyModeEnabled ? "good" : "warning"}>用户 Key 模式</StatusPill>
          <StatusPill tone={overview.llm.platformQuotaEnabled ? "good" : "warning"}>
            {overview.llm.platformQuotaEnabled ? "平台额度已启用" : "平台额度未生效"}
          </StatusPill>
          <StatusPill tone={overview.auth.adminEmailCount > 0 ? "good" : "warning"}>管理员 {overview.auth.adminEmailCount}</StatusPill>
        </div>
        <div className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all font-mono">{overview.dataRoot}</span>
        </div>
      </section>

      <section className="rounded-lg border border-border/70 bg-card/75 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-normal">内测额度</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              平台 Key 需通过 DEEPSEEK_PLATFORM_API_KEY 配置；用户没有个人 Key 时才会使用平台额度。
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Coins className="h-4 w-4" />
          </span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusPill tone={overview.quota.platformApiKeyConfigured ? "good" : "warning"}>
            {overview.quota.platformApiKeyConfigured ? "平台 Key 已配置" : "平台 Key 未配置"}
          </StatusPill>
          <StatusPill tone={overview.quota.enforcementEnabled ? "good" : "warning"}>
            {overview.quota.enforcementEnabled ? "额度熔断已生效" : "额度熔断未生效"}
          </StatusPill>
          <StatusPill>已用 {formatMoney(overview.quota.total.estimatedCostCny)} 元</StatusPill>
          <StatusPill>剩余 {formatMoney(overview.quota.total.remainingCny)} 元</StatusPill>
          <StatusPill>命中 {overview.quota.total.promptCacheHitTokens}</StatusPill>
          <StatusPill>未命中 {overview.quota.total.promptCacheMissTokens}</StatusPill>
        </div>

        {quotaDraft ? (
          <form className="space-y-4" onSubmit={saveQuotaSettings}>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={quotaDraft.enabled}
                onChange={(event) => updateQuotaDraft("enabled", event.target.checked)}
                className="h-4 w-4"
              />
              启用平台试用额度
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <QuotaNumberInput
                label="总额度"
                value={quotaDraft.totalBudgetCny}
                suffix="元"
                onChange={(value) => updateQuotaDraft("totalBudgetCny", value)}
              />
              <QuotaNumberInput
                label="单用户额度"
                value={quotaDraft.perUserBudgetCny}
                suffix="元/人"
                onChange={(value) => updateQuotaDraft("perUserBudgetCny", value)}
              />
              <QuotaNumberInput
                label="缓存命中输入单价"
                value={quotaDraft.promptCacheHitPricePerMillionCny}
                suffix="元/百万"
                onChange={(value) => updateQuotaDraft("promptCacheHitPricePerMillionCny", value)}
              />
              <QuotaNumberInput
                label="缓存未命中输入单价"
                value={quotaDraft.promptCacheMissPricePerMillionCny}
                suffix="元/百万"
                onChange={(value) => updateQuotaDraft("promptCacheMissPricePerMillionCny", value)}
              />
              <QuotaNumberInput
                label="输出 token 单价"
                value={quotaDraft.outputPricePerMillionCny}
                suffix="元/百万"
                onChange={(value) => updateQuotaDraft("outputPricePerMillionCny", value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={quotaSaving}>
                <Save className="h-4 w-4" />
                {quotaSaving ? "保存中..." : "保存额度"}
              </Button>
              {quotaMessage ? <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{quotaMessage}</span> : null}
              {quotaError ? <span className="text-[12px] text-destructive">{quotaError}</span> : null}
            </div>
          </form>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-normal">邀请码</h2>
          <span className="text-[12px] text-muted-foreground">{overview.auth.invites.length} 个</span>
        </div>
        <div className="hidden border-t border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground md:grid md:grid-cols-[minmax(180px,1fr)_96px_minmax(180px,1fr)_120px]">
          <div>邀请码</div>
          <div>状态</div>
          <div>兑换用户</div>
          <div>兑换时间</div>
        </div>
        {overview.auth.invites.length > 0 ? (
          overview.auth.invites.map((invite) => <InviteRow key={`${invite.codeHash}-${invite.configured}`} invite={invite} />)
        ) : (
          <div className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            暂无邀请码
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-normal">内测用户</h2>
          <span className="text-[12px] text-muted-foreground">{sortedUsers.length} 人</span>
        </div>
        <div className="hidden border-t border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground md:grid md:grid-cols-[minmax(220px,1.4fr)_80px_96px_96px_112px_132px_120px]">
          <div>账号</div>
          <div>书籍</div>
          <div>数据</div>
          <div>模型 Key</div>
          <div>平台额度</div>
          <div>Session</div>
          <div>最近数据</div>
        </div>
        {sortedUsers.length > 0 ? (
          sortedUsers.map((user) => (
            <UserRow key={user.id} user={user} quotaUsage={quotaUsageByUserId.get(user.id)} />
          ))
        ) : (
          <div className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            暂无用户
          </div>
        )}
      </section>
    </div>
  )
}
