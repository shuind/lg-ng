"use client"

import { PenLine, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import type { Skill } from "@/lib/types"
import { skillDirectoryName, skillDisplayName, skillKindLabel } from "./skill-pane-utils"

export function SkillCard({
  skill,
  isStyleGuide,
  summary,
  refreshing,
  deleting,
  onEdit,
  onDelete,
  onRefresh,
  onOpenFile,
}: {
  skill: Skill
  isStyleGuide: boolean
  summary: string
  refreshing: boolean
  deleting: boolean
  onEdit: (skill: Skill) => void
  onDelete: (skill: Skill) => void
  onRefresh: () => void
  onOpenFile: (path: string) => void
}) {
  const canEditSkill = !isStyleGuide && skillDirectoryName(skill) !== null

  return (
    <div className="paper rounded-lg border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground/80" />
            <span className="font-serif text-[15px] text-foreground">{skillDisplayName(skill)}</span>
            <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
              {skillKindLabel(skill)}
            </span>
            {skill.stage === "experimental" && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                实验中
              </span>
            )}
            {isStyleGuide && skill?.dirty && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                需要刷新
              </span>
            )}
          </div>
          {skill.description && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{skill.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEditSkill && (
            <>
              <button
                onClick={() => onEdit(skill)}
                disabled={deleting}
                title="编辑"
                aria-label="编辑"
                className="rounded-md border border-border/70 p-1.5 text-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                <PenLine className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(skill)}
                disabled={deleting}
                title="删除"
                aria-label="删除"
                className="rounded-md border border-destructive/30 p-1.5 text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {isStyleGuide && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "刷新中…" : "刷新"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <button
          onClick={() => onOpenFile(skill.sourceFile)}
          className="flex min-w-0 items-center transition hover:text-foreground"
          title={skill.sourceFile}
        >
          <span className="truncate font-mono text-[10.5px] text-foreground/70">{skill.sourceFile}</span>
        </button>
        <span className="ml-auto shrink-0 rounded-full bg-muted/40 px-2 py-0.5 font-mono text-[10px]">
          {skill.summaryTokenCount} tok
        </span>
      </div>

      {skill.stage === "experimental" && skill.usage && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          用了 {skill.usage.timesUsed} 次 · 重写率 {Math.round(skill.usage.rewriteRate * 100)}%
        </div>
      )}

      {isStyleGuide && summary.trim() && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11.5px] text-muted-foreground transition hover:text-foreground">
            查看压缩层摘要
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/55 p-3 font-serif text-[12px] leading-[1.75] text-foreground/90">
            {summary}
          </pre>
        </details>
      )}
    </div>
  )
}
