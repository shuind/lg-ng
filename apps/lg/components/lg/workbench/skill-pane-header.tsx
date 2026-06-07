"use client"

import { Plus } from "lucide-react"

export function SkillPaneHeader({
  skillCount,
  onCreateSkill,
}: {
  skillCount: number
  onCreateSkill: () => void
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-serif text-[16px] text-foreground">Skill</div>
          <div className="mt-1 text-[12px] text-muted-foreground">可复用写作能力与上下文压缩层</div>
        </div>
        <span className="text-[11px] text-muted-foreground">{skillCount} 个可用</span>
      </div>

      <button
        onClick={onCreateSkill}
        className="mb-4 flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90"
      >
        <Plus className="h-3 w-3" />
        新建 Skill
      </button>
    </>
  )
}
