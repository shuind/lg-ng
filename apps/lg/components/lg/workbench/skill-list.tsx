"use client"

import type { Skill } from "@/lib/types"
import { SkillCard } from "./skill-card"

export function SkillList({
  skills,
  styleSkill,
  summary,
  refreshing,
  onEdit,
  onRefresh,
  onOpenFile,
}: {
  skills: Skill[]
  styleSkill: Skill | null
  summary: string
  refreshing: boolean
  onEdit: (skill: Skill) => void
  onRefresh: () => void
  onOpenFile: (path: string) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          isStyleGuide={skill.id === styleSkill?.id}
          summary={summary}
          refreshing={refreshing}
          onEdit={onEdit}
          onRefresh={onRefresh}
          onOpenFile={onOpenFile}
        />
      ))}
      {skills.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
          暂无 Skill。可以在 .claude/skills/ 下添加 SKILL.md。
        </div>
      )}
    </div>
  )
}
