"use client"

import { Beaker, GitCompare, RefreshCw, Sparkles, X } from "lucide-react"
import type { SkillCandidate, SkillDraftResponse } from "@/lib/types"

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function statusLabel(status: SkillCandidate["status"]): string {
  if (status === "drafted") return "已生成草稿"
  if (status === "dismissed") return "已忽略"
  return "候选"
}

export function SkillLab({
  candidates,
  loading,
  refreshing,
  draftingId,
  error,
  onRefresh,
  onDismiss,
  onDraft,
}: {
  candidates: SkillCandidate[]
  loading: boolean
  refreshing: boolean
  draftingId: string | null
  error: string
  onRefresh: () => void
  onDismiss: (candidateId: string) => void
  onDraft: (candidateId: string) => Promise<SkillDraftResponse | void> | void
}) {
  const visibleCandidates = candidates.filter((candidate) => candidate.status !== "dismissed")

  return (
    <section className="mb-6 rounded-lg border border-border/60 bg-card/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-muted-foreground" />
            <div className="font-serif text-[15px] text-foreground">Skill Lab</div>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            从近期对话和改稿差异中提炼可验证的 Skill 候选；这里只沉淀和实验，不会自动注入创作流程。
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex shrink-0 items-center gap-1 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中" : "刷新候选"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-[12px] text-muted-foreground">正在读取 Skill 候选...</div>
      ) : visibleCandidates.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-background/35 px-3 py-5 text-center text-[12px] leading-relaxed text-muted-foreground">
          暂无候选。继续对话、采纳改稿或点击刷新后，这里会显示可验证的 Skill 实验材料。
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {visibleCandidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              drafting={draftingId === candidate.id}
              onDismiss={() => onDismiss(candidate.id)}
              onDraft={() => onDraft(candidate.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CandidateCard({
  candidate,
  drafting,
  onDismiss,
  onDraft,
}: {
  candidate: SkillCandidate
  drafting: boolean
  onDismiss: () => void
  onDraft: () => void
}) {
  return (
    <article className="rounded-lg border border-border/60 bg-background/45 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="font-serif text-[14px] text-foreground">{candidate.title}</div>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {statusLabel(candidate.status)}
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              置信 {percent(candidate.confidence)}
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {candidate.occurrenceCount} 条证据
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{candidate.summary}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            触发：{candidate.trigger}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onDraft}
            disabled={drafting}
            className="rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {drafting ? "生成中" : "生成草稿"}
          </button>
          <button
            onClick={onDismiss}
            className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="忽略候选"
            title="忽略候选"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-md border border-border/50 bg-card/45 p-3">
          <div className="text-[11px] font-medium text-foreground">规则假设</div>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {candidate.rules.map((rule) => (
              <li key={rule}>- {rule}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-border/50 bg-card/45 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <GitCompare className="h-3 w-3" />
            验证样本
          </div>
          <div className="mt-2 space-y-2">
            {candidate.evalCases.slice(0, 2).map((item) => (
              <div key={item.id} className="text-[11.5px] leading-relaxed">
                <div className="line-clamp-2 text-foreground/80">{item.input}</div>
                <div className="mt-0.5 text-muted-foreground">期望：{item.expectedDirection}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border/50 bg-card/45 p-3">
          <div className="text-[11px] font-medium text-foreground">探索变体</div>
          <div className="mt-2 space-y-2">
            {candidate.variants.map((variant) => (
              <div key={variant.id} className="text-[11.5px] leading-relaxed">
                <div className="text-foreground/80">{variant.name}</div>
                <div className="text-muted-foreground">{variant.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11.5px] text-muted-foreground transition hover:text-foreground">
          查看来源证据
        </summary>
        <div className="mt-2 space-y-2">
          {candidate.evidence.map((item) => (
            <div key={item.id} className="rounded-md bg-muted/30 px-3 py-2 text-[11.5px] leading-relaxed">
              <div className="text-foreground/80">{item.label}</div>
              <div className="mt-1 text-muted-foreground">{item.text}</div>
            </div>
          ))}
        </div>
      </details>
    </article>
  )
}
