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
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <div className="font-serif text-[16px] text-foreground">Skill</div>
        <div className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
          可复用写作能力包。每个 Skill 都是同等地位的可插拔任务流程，试写会按意图动态启用合适的书籍 Skill · {skillCount} 个可用
        </div>
      </div>
      <button
        onClick={onCreateSkill}
        className="flex shrink-0 items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-[11.5px] font-medium text-background transition hover:opacity-90"
      >
        <Plus className="h-3 w-3" />
        新建 Skill
      </button>
    </div>
  )
}
