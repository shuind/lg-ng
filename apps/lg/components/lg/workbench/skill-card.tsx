"use client"

import { PenLine, Sparkles } from "lucide-react"
import type { Skill } from "@/lib/types"
import { skillDirectoryName, skillDisplayName, skillKindLabel } from "./skill-pane-utils"

export function SkillCard({
  skill,
  isStyleGuide,
  summary,
  refreshing,
  onEdit,
  onRefresh,
  onOpenFile,
}: {
  skill: Skill
  isStyleGuide: boolean
  summary: string
  refreshing: boolean
  onEdit: (skill: Skill) => void
  onRefresh: () => void
  onOpenFile: (path: string) => void
}) {
  const canEditSkill = !isStyleGuide && skillDirectoryName(skill) !== null

  return (
    <div className="paper rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground/80" />
            <span className="font-serif text-[15px] text-foreground">{skillDisplayName(skill)}</span>
            {skill?.dirty ? (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                需要刷新
              </span>
            ) : (
              <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                最新
              </span>
            )}
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {skillKindLabel(skill)}
            </span>
          </div>
          {skill.description && (
            <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
              {skill.description}
            </p>
          )}
        </div>
        {canEditSkill && (
          <button
            onClick={() => onEdit(skill)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition hover:bg-secondary"
          >
            <PenLine className="h-3 w-3" />
            编辑
          </button>
        )}
        {isStyleGuide && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="shrink-0 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {refreshing ? "刷新中…" : "刷新"}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-1.5 text-[11.5px]">
        <button
          onClick={() => onOpenFile(skill.sourceFile)}
          className="flex max-w-full items-center gap-2 text-left transition hover:text-foreground"
        >
          <span className="w-16 shrink-0 text-muted-foreground">源文件</span>
          <span className="truncate font-mono text-foreground/80">{skill.sourceFile}</span>
        </button>
        {skill.summaryFile && (
          <button
            onClick={() => onOpenFile(skill.summaryFile!)}
            className="flex max-w-full items-center gap-2 text-left transition hover:text-foreground"
          >
            <span className="w-16 shrink-0 text-muted-foreground">压缩层</span>
            <span className="truncate font-mono text-foreground/80">{skill.summaryFile}</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">Token</span>
          <span className="font-mono text-foreground/80">{skill.summaryTokenCount}</span>
        </div>
        {isStyleGuide && summary.trim() && (
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/55 p-3 font-serif text-[12px] leading-[1.75] text-foreground/90">
            {summary}
          </pre>
        )}
      </div>
    </div>
  )
}
