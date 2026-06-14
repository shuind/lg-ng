"use client"

import type { Skill } from "@/lib/types"
import { SkillCard } from "./skill-card"

export function SkillList({
  skills,
  styleSkill,
  summary,
  refreshing,
  deletingSkillId,
  error,
  onEdit,
  onDelete,
  onRefresh,
  onOpenFile,
}: {
  skills: Skill[]
  styleSkill: Skill | null
  summary: string
  refreshing: boolean
  deletingSkillId: string | null
  error: string
  onEdit: (skill: Skill) => void
  onDelete: (skill: Skill) => void
  onRefresh: () => void
  onOpenFile: (path: string) => void
}) {
  const otherSkills = skills.filter((skill) => skill.id !== styleSkill?.id)

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {styleSkill && (
        <SkillCard
          skill={styleSkill}
          isStyleGuide
          summary={summary}
          refreshing={refreshing}
          deleting={false}
          onEdit={onEdit}
          onDelete={onDelete}
          onRefresh={onRefresh}
          onOpenFile={onOpenFile}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {otherSkills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            isStyleGuide={false}
            summary=""
            refreshing={false}
            deleting={deletingSkillId === skill.id}
            onEdit={onEdit}
            onDelete={onDelete}
            onRefresh={onRefresh}
            onOpenFile={onOpenFile}
          />
        ))}
        {otherSkills.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-[12px] leading-relaxed text-muted-foreground md:col-span-2">
            还没有项目 Skill。点右上角“新建 Skill”，或到 Skill Lab 里让 AI 从你的改稿提炼。
          </div>
        )}
      </div>
    </div>
  )
}
