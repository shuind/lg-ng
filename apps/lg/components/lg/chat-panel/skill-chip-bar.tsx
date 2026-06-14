"use client"

import { Sparkles, XCircle } from "lucide-react"
import type { Skill } from "@/lib/types"
import { skillDisplayName, skillTypeLabel } from "./picker-utils"

export function SkillChipBar({
  skills,
  onRemove,
}: {
  skills: Skill[]
  onRemove: (skillId: string) => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Skill</div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span
            key={skill.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/5 px-2 py-1 text-[11px] text-foreground ring-1 ring-primary/20"
          >
            <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{skillDisplayName(skill)}</span>
            <span className="hidden rounded bg-muted/60 px-1 text-[10px] text-muted-foreground sm:inline">
              {skillTypeLabel(skill)}
            </span>
            {skill.stage === "experimental" && (
              <span className="hidden rounded-full bg-accent/20 px-1 text-[10px] text-accent-foreground sm:inline">
                实验中
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(skill.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除 Skill ${skillDisplayName(skill)}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
