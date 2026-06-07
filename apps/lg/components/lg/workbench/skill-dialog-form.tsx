"use client"

import { WandSparkles } from "lucide-react"
import type { SkillResourceKind } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const SKILL_RESOURCE_OPTIONS: Array<{ id: SkillResourceKind; label: string; description: string }> = [
  { id: "references", label: "references", description: "放长规则、参考资料、设定说明。" },
  { id: "scripts", label: "scripts", description: "放可重复使用的文本处理脚本或辅助代码。" },
  { id: "assets", label: "assets", description: "放可复用的文本模板、素材说明。" },
]

export function SkillDialogForm({
  skillName,
  goal,
  triggers,
  examples,
  resourceKinds,
  generating,
  loadingSkillDraft,
  onSkillNameChange,
  onSkillNameBlur,
  onGoalChange,
  onTriggersChange,
  onExamplesChange,
  onToggleResourceKind,
  onGenerateDraft,
}: {
  skillName: string
  goal: string
  triggers: string
  examples: string
  resourceKinds: SkillResourceKind[]
  generating: boolean
  loadingSkillDraft: boolean
  onSkillNameChange: (value: string) => void
  onSkillNameBlur: () => void
  onGoalChange: (value: string) => void
  onTriggersChange: (value: string) => void
  onExamplesChange: (value: string) => void
  onToggleResourceKind: (kind: SkillResourceKind, checked: boolean) => void
  onGenerateDraft: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">Skill 短名</label>
        <Input
          value={skillName}
          onChange={(event) => onSkillNameChange(event.target.value)}
          onBlur={onSkillNameBlur}
          placeholder="novel-review"
          className="font-mono text-[12px]"
        />
        <div className="text-[11px] text-muted-foreground">
          只能用小写英文字母、数字和连字符。保存后会成为 .claude/skills/&lt;name&gt;。
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">用途</label>
        <Textarea
          value={goal}
          onChange={(event) => onGoalChange(event.target.value)}
          placeholder="这套 Skill 要沉淀哪一种可复用的写作流程？"
          className="min-h-20 text-[12px]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">什么时候用</label>
        <Textarea
          value={triggers}
          onChange={(event) => onTriggersChange(event.target.value)}
          placeholder="用户提出什么需求时，应该使用这个 Skill？"
          className="min-h-20 text-[12px]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">例子</label>
        <Textarea
          value={examples}
          onChange={(event) => onExamplesChange(event.target.value)}
          placeholder="可以写几个示例需求，或期望输出长什么样。"
          className="min-h-20 text-[12px]"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="text-[12px] font-medium text-foreground">文本资源目录</div>
        {SKILL_RESOURCE_OPTIONS.map((option) => (
          <label key={option.id} className="flex items-start gap-2 rounded-md px-1 py-1">
            <Checkbox
              checked={resourceKinds.includes(option.id)}
              onCheckedChange={(checked) => onToggleResourceKind(option.id, checked === true)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block font-mono text-[12px] text-foreground">{option.label}</span>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <button
        onClick={onGenerateDraft}
        disabled={generating || loadingSkillDraft}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2 text-[12px] font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
      >
        <WandSparkles className="h-3.5 w-3.5" />
        {generating ? "生成中..." : "生成草稿"}
      </button>
    </div>
  )
}
