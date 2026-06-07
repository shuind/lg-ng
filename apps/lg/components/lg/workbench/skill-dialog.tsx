"use client"

import type { SkillResourceKind, SkillTextResource } from "@/lib/types"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SkillDialogForm } from "./skill-dialog-form"
import { SkillDialogResources } from "./skill-dialog-resources"

export function SkillDialog({
  open,
  isEditingSkill,
  skillName,
  goal,
  triggers,
  examples,
  resourceKinds,
  skillMd,
  resources,
  warnings,
  createError,
  generating,
  savingSkill,
  loadingSkillDraft,
  onOpenChange,
  onSkillNameChange,
  onSkillNameBlur,
  onGoalChange,
  onTriggersChange,
  onExamplesChange,
  onToggleResourceKind,
  onGenerateDraft,
  onSkillMdChange,
  onAddResource,
  onUpdateResource,
  onRemoveResource,
  onCancel,
  onSave,
}: {
  open: boolean
  isEditingSkill: boolean
  skillName: string
  goal: string
  triggers: string
  examples: string
  resourceKinds: SkillResourceKind[]
  skillMd: string
  resources: SkillTextResource[]
  warnings: string[]
  createError: string
  generating: boolean
  savingSkill: boolean
  loadingSkillDraft: boolean
  onOpenChange: (open: boolean) => void
  onSkillNameChange: (value: string) => void
  onSkillNameBlur: () => void
  onGoalChange: (value: string) => void
  onTriggersChange: (value: string) => void
  onExamplesChange: (value: string) => void
  onToggleResourceKind: (kind: SkillResourceKind, checked: boolean) => void
  onGenerateDraft: () => void
  onSkillMdChange: (value: string) => void
  onAddResource: (kind?: SkillResourceKind) => void
  onUpdateResource: (index: number, patch: Partial<SkillTextResource>) => void
  onRemoveResource: (index: number) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEditingSkill ? "编辑项目 Skill" : "新建项目 Skill"}</DialogTitle>
          <DialogDescription>
            {isEditingSkill
              ? "编辑当前书籍里的 Skill。要改短名时，目录名和 SKILL.md 开头的 name 需要一致。"
              : "在当前书籍的 .claude/skills 下创建 Skill。可以先生成草稿，也可以直接粘贴完整 SKILL.md。"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <SkillDialogForm
            skillName={skillName}
            goal={goal}
            triggers={triggers}
            examples={examples}
            resourceKinds={resourceKinds}
            generating={generating}
            loadingSkillDraft={loadingSkillDraft}
            onSkillNameChange={onSkillNameChange}
            onSkillNameBlur={onSkillNameBlur}
            onGoalChange={onGoalChange}
            onTriggersChange={onTriggersChange}
            onExamplesChange={onExamplesChange}
            onToggleResourceKind={onToggleResourceKind}
            onGenerateDraft={onGenerateDraft}
          />

          <SkillDialogResources
            skillMd={skillMd}
            resources={resources}
            warnings={warnings}
            createError={createError}
            resourceKinds={resourceKinds}
            loadingSkillDraft={loadingSkillDraft}
            onSkillMdChange={onSkillMdChange}
            onAddResource={onAddResource}
            onUpdateResource={onUpdateResource}
            onRemoveResource={onRemoveResource}
          />
        </div>

        <DialogFooter>
          <button
            onClick={onCancel}
            disabled={savingSkill}
            className="rounded-md border border-border/70 px-3 py-2 text-[12px] transition hover:bg-secondary disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={savingSkill || generating || loadingSkillDraft}
            className="rounded-md bg-foreground px-3 py-2 text-[12px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {savingSkill ? "保存中..." : isEditingSkill ? "保存修改" : "创建 Skill"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
