"use client"

import type { Skill } from "@/lib/types"
import { SkillCard } from "./skill-card"

export function SkillList({
  skills,
  deletingSkillId,
  error,
  onEdit,
  onDelete,
  onOpenFile,
}: {
  skills: Skill[]
  deletingSkillId: string | null
  error: string
  onEdit: (skill: Skill) => void
  onDelete: (skill: Skill) => void
  onOpenFile: (path: string) => void
}) {
  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            deleting={deletingSkillId === skill.id}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpenFile={onOpenFile}
          />
        ))}
        {skills.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-[12px] leading-relaxed text-muted-foreground md:col-span-2">
            还没有 Skill。点右上角“新建 Skill”，或到 Skill Lab 里让 AI 从你的改稿提炼。
          </div>
        )}
      </div>
    </div>
  )
}
