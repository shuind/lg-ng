"use client"

import { Check } from "lucide-react"
import type { Skill } from "@/lib/types"
import { cn } from "@/lib/utils"
import { skillDisplayName, skillTypeLabel } from "./picker-utils"

export function SkillPicker({
  skills,
  selectedIds,
  onToggle,
}: {
  skills: Skill[]
  selectedIds: string[]
  onToggle: (skillId: string) => void
}) {
  return (
    <div className="space-y-2">
      {skills.map((skill) => {
        const selected = selectedIds.includes(skill.id)
        return (
          <button
            key={skill.id}
            type="button"
            onClick={() => onToggle(skill.id)}
            className={cn(
              "flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition",
              selected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40 hover:bg-secondary/60",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {selected && <Check className="h-3 w-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12px] font-medium text-foreground">{skillDisplayName(skill)}</span>
                <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {skillTypeLabel(skill)}
                </span>
                {skill.dirty && (
                  <span className="shrink-0 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-foreground">
                    需刷新
                  </span>
                )}
              </span>
              {skill.description && (
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {skill.description}
                </span>
              )}
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
                {skill.summaryFile || skill.sourceFile}
              </span>
            </span>
          </button>
        )
      })}
      {skills.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
          暂无 Skill
        </div>
      )}
    </div>
  )
}
