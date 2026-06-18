"use client"

import type { ReactNode } from "react"
import { SKILL_KIND_OPTIONS } from "@/lib/skill-kind"
import type { Skill, SkillKind } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SkillCard } from "./skill-card"

export function SkillList({
  skills,
  kindFilter,
  onKindFilterChange,
  deletingSkillId,
  error,
  onEdit,
  onDelete,
  onOpenFile,
}: {
  skills: Skill[]
  kindFilter: SkillKind | "all"
  onKindFilterChange: (kind: SkillKind | "all") => void
  deletingSkillId: string | null
  error: string
  onEdit: (skill: Skill) => void
  onDelete: (skill: Skill) => void
  onOpenFile: (path: string) => void
}) {
  const filteredSkills = kindFilter === "all" ? skills : skills.filter((skill) => skill.kind === kindFilter)

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      <div className="inline-flex rounded-lg bg-muted/50 p-0.5">
        <KindFilterButton active={kindFilter === "all"} onClick={() => onKindFilterChange("all")}>
          全部
        </KindFilterButton>
        {SKILL_KIND_OPTIONS.map((option) => (
          <KindFilterButton
            key={option.kind}
            active={kindFilter === option.kind}
            onClick={() => onKindFilterChange(option.kind)}
          >
            {option.label}
          </KindFilterButton>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filteredSkills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            deleting={deletingSkillId === skill.id}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpenFile={onOpenFile}
          />
        ))}
        {filteredSkills.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-[12px] leading-relaxed text-muted-foreground md:col-span-2">
            {skills.length === 0 ? "还没有 Skill。点右上角“新建 Skill”，或到 Skill Lab 里让 AI 从你的改稿提炼。" : "这个分类下还没有 Skill。"}
          </div>
        )}
      </div>
    </div>
  )
}

function KindFilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-[11px] transition",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
