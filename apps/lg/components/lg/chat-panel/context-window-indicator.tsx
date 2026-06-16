"use client"

import type { MessageContextWindow } from "@/lib/types"

const CIRCLE_SIZE = 14
const STROKE_WIDTH = 2
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ContextWindowIndicator({ contextWindow }: { contextWindow?: MessageContextWindow }) {
  if (!contextWindow || contextWindow.budgetTokens <= 0) return null

  const ratio = Math.max(0, Math.min(1, contextWindow.ratio))
  const percent = Math.round(ratio * 100)
  const triggerPercent = Math.round(contextWindow.triggerRatio * 100)
  const level = contextWindow.level ?? levelFromRatio(contextWindow.ratio, contextWindow.triggerRatio)
  const levelLabel = levelLabels[level]
  const components = contextWindow.components
  const title = [
    `${levelLabel} · 上下文 ${percent}% · 约 ${formatTokenCount(contextWindow.estimatedTokens)} / ${formatTokenCount(contextWindow.budgetTokens)}`,
    `压缩阈值 ${triggerPercent}%`,
    contextWindow.reserveTokens ? `输出预留 ${formatTokenCount(contextWindow.reserveTokens)}` : "",
    components ? `session ${formatTokenCount(components.sessionMessages)} · project/memory ${formatTokenCount(components.projectContext)} · prompt ${formatTokenCount(components.currentPrompt)} · reserve ${formatTokenCount(components.expectedOutputReserve)}` : "",
    contextWindow.lastCompactedAt ? `最近压缩 ${formatCompactedAt(contextWindow.lastCompactedAt)}` : "尚未压缩",
  ].filter(Boolean).join("\n")

  return (
    <div className="group relative flex h-5 w-5 items-center justify-center" title={title} aria-label={title}>
      <svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`} className="-rotate-90">
        <circle
          cx={CIRCLE_SIZE / 2}
          cy={CIRCLE_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          className="text-muted-foreground/18"
        />
        <circle
          cx={CIRCLE_SIZE / 2}
          cy={CIRCLE_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          className={`${levelStrokeClass[level]} transition-[stroke-dashoffset]`}
        />
      </svg>
      <div className="pointer-events-none absolute bottom-9 right-0 z-40 hidden w-max max-w-72 rounded-md border border-border/70 bg-popover px-2.5 py-2 text-[11px] leading-relaxed text-popover-foreground shadow-md group-hover:block">
        <div className={levelTextClass[level]}>{levelLabel} · 上下文 {percent}%</div>
        <div>约 {formatTokenCount(contextWindow.estimatedTokens)} / {formatTokenCount(contextWindow.budgetTokens)}</div>
        <div className="text-muted-foreground">压缩阈值 {triggerPercent}%</div>
        {components ? (
          <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 text-muted-foreground">
            <span>session</span><span>{formatTokenCount(components.sessionMessages)}</span>
            <span>project/memory</span><span>{formatTokenCount(components.projectContext)}</span>
            <span>prompt</span><span>{formatTokenCount(components.currentPrompt)}</span>
            <span>reserve</span><span>{formatTokenCount(components.expectedOutputReserve)}</span>
          </div>
        ) : null}
        <div className="text-muted-foreground">
          {contextWindow.lastCompactedAt ? `最近压缩 ${formatCompactedAt(contextWindow.lastCompactedAt)}` : "尚未压缩"}
        </div>
      </div>
    </div>
  )
}

const levelLabels: NonNullable<Record<NonNullable<MessageContextWindow["level"]>, string>> = {
  normal: "正常",
  warning: "接近上限",
  should_compact: "建议压缩",
  auto_compact: "自动压缩区",
  blocking: "接近阻塞",
}

const levelStrokeClass: NonNullable<Record<NonNullable<MessageContextWindow["level"]>, string>> = {
  normal: "text-emerald-500",
  warning: "text-amber-500",
  should_compact: "text-orange-500",
  auto_compact: "text-red-500",
  blocking: "text-red-700",
}

const levelTextClass: NonNullable<Record<NonNullable<MessageContextWindow["level"]>, string>> = {
  normal: "text-emerald-600",
  warning: "text-amber-600",
  should_compact: "text-orange-600",
  auto_compact: "text-red-600",
  blocking: "text-red-700",
}

function levelFromRatio(ratio: number, triggerRatio: number): NonNullable<MessageContextWindow["level"]> {
  if (ratio >= 1) return "blocking"
  if (ratio >= triggerRatio) return "auto_compact"
  if (ratio >= 0.65) return "should_compact"
  if (ratio >= 0.5) return "warning"
  return "normal"
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return String(Math.max(0, Math.round(tokens)))
}

function formatCompactedAt(value: string): string {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return value
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000))
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}
