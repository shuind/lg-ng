"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Lightbulb, WandSparkles } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SKILL_KIND_OPTIONS } from "@/lib/skill-kind"
import { cn } from "@/lib/utils"
import { SkillResourcesEditor } from "./skill-dialog-resources"
import type { SkillDialogController } from "./use-skill-dialog-state"

export function SkillDialog({ dialog }: { dialog: SkillDialogController }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const isIntent = !dialog.isEditingSkill && dialog.step === "intent"

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dialog.isEditingSkill ? "编辑 Skill" : "新建 Skill"}</DialogTitle>
          <DialogDescription>
            {isIntent
              ? "用一句话说清楚你想让这个 Skill 做什么，AI 会生成可直接保存的 SKILL.md。"
              : "确认 / 微调下面的 SKILL.md，保存后会写入 .novel-guide/skills/<短名>。"}
          </DialogDescription>
        </DialogHeader>

        {isIntent ? (
          <IntentStep dialog={dialog} />
        ) : (
          <PreviewStep
            dialog={dialog}
            advancedOpen={advancedOpen}
            onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
          />
        )}

        <DialogFooter>
          <button
            onClick={dialog.handleCancel}
            disabled={dialog.savingSkill}
            className="rounded-md border border-border/70 px-3 py-2 text-[12px] transition hover:bg-secondary disabled:opacity-50"
          >
            取消
          </button>
          {!isIntent && (
            <button
              onClick={dialog.handleSaveSkill}
              disabled={dialog.savingSkill || dialog.loadingSkillDraft}
              className="rounded-md bg-foreground px-3 py-2 text-[12px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {dialog.savingSkill ? "保存中..." : dialog.isEditingSkill ? "保存修改" : "创建 Skill"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IntentStep({ dialog }: { dialog: SkillDialogController }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">想让这个 Skill 做什么？</label>
        <Textarea
          value={dialog.intent}
          onChange={(event) => dialog.setIntent(event.target.value)}
          placeholder="例：写战斗场景时，先交代双方力量差和空间位置，再写招式因果，避免一招带过。"
          className="min-h-28 text-[12px] leading-relaxed"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">分类</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {SKILL_KIND_OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              onClick={() => dialog.handleSkillKindChange(option.kind)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition",
                dialog.skillKind === option.kind
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <span className="block text-[12px] font-medium">{option.label}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed">{option.description}</span>
            </button>
          ))}
        </div>
      </div>

      {dialog.createError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {dialog.createError}
        </div>
      )}

      <button
        onClick={dialog.handleGenerateDraft}
        disabled={dialog.generating || !dialog.intent.trim()}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-[12px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
      >
        <WandSparkles className="h-3.5 w-3.5" />
        {dialog.generating ? "生成中..." : "用 AI 生成"}
      </button>
      <button
        onClick={dialog.skipToManualDraft}
        className="w-full text-center text-[11.5px] text-muted-foreground transition hover:text-foreground"
      >
        跳过，直接手写 SKILL.md
      </button>
    </div>
  )
}

function PreviewStep({
  dialog,
  advancedOpen,
  onToggleAdvanced,
}: {
  dialog: SkillDialogController
  advancedOpen: boolean
  onToggleAdvanced: () => void
}) {
  return (
    <div className="space-y-3">
      {dialog.hint && (
        <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[11.5px] leading-relaxed text-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-foreground" />
          <div>
            <span className="font-medium">AI 改进建议：</span>
            {dialog.hint}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-foreground">短名</label>
          <Input
            value={dialog.skillName}
            onChange={(event) => dialog.handleSkillNameChange(event.target.value)}
            onBlur={dialog.handleSkillNameBlur}
            placeholder="novel-skill"
            className="font-mono text-[12px]"
          />
          <div className="text-[11px] leading-relaxed text-muted-foreground">小写英文 / 数字 / 连字符</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-foreground">SKILL.md</label>
          {dialog.loadingSkillDraft && (
            <div className="rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-[11.5px] text-muted-foreground">
              正在读取已有 Skill...
            </div>
          )}
          <Textarea
            value={dialog.skillMd}
            onChange={(event) => dialog.handleSkillMdChange(event.target.value)}
            disabled={dialog.loadingSkillDraft}
            spellCheck={false}
            className="min-h-[320px] resize-y font-mono text-[12px] leading-relaxed"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-background/40">
        <button
          onClick={onToggleAdvanced}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-foreground"
        >
          {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          高级：资源文件{dialog.resources.length ? `（${dialog.resources.length}）` : ""}
        </button>
        {advancedOpen && (
          <div className="border-t border-border/60 p-3">
            <SkillResourcesEditor
              resources={dialog.resources}
              disabled={dialog.loadingSkillDraft}
              onAddResource={dialog.handleAddResource}
              onUpdateResource={dialog.handleUpdateResource}
              onRemoveResource={dialog.handleRemoveResource}
            />
          </div>
        )}
      </div>

      {(dialog.warnings.length > 0 || dialog.createError) && (
        <div className="space-y-1 rounded-lg border border-border/70 bg-muted/35 p-3 text-[11.5px] leading-relaxed">
          {dialog.createError && <div className="font-medium text-destructive">{dialog.createError}</div>}
          {dialog.warnings.map((warning, index) => (
            <div key={`${warning}-${index}`} className="text-muted-foreground">
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
