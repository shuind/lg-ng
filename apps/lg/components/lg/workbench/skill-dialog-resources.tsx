"use client"

import { Trash2 } from "lucide-react"
import type { SkillResourceKind, SkillTextResource } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function SkillDialogResources({
  skillMd,
  resources,
  warnings,
  createError,
  resourceKinds,
  loadingSkillDraft,
  onSkillMdChange,
  onAddResource,
  onUpdateResource,
  onRemoveResource,
}: {
  skillMd: string
  resources: SkillTextResource[]
  warnings: string[]
  createError: string
  resourceKinds: SkillResourceKind[]
  loadingSkillDraft: boolean
  onSkillMdChange: (value: string) => void
  onAddResource: (kind?: SkillResourceKind) => void
  onUpdateResource: (index: number, patch: Partial<SkillTextResource>) => void
  onRemoveResource: (index: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-foreground">SKILL.md</label>
        {loadingSkillDraft && (
          <div className="rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-[11.5px] text-muted-foreground">
            正在读取已有 Skill...
          </div>
        )}
        <Textarea
          value={skillMd}
          onChange={(event) => onSkillMdChange(event.target.value)}
          disabled={loadingSkillDraft}
          spellCheck={false}
          className="min-h-[320px] resize-y font-mono text-[12px] leading-relaxed"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-medium text-foreground">资源文件</div>
          <button
            onClick={() => onAddResource(resourceKinds[0] ?? "references")}
            disabled={loadingSkillDraft}
            className="rounded-md border border-border/70 px-2 py-1 text-[11px] transition hover:bg-secondary"
          >
            添加文本文件
          </button>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {resources.map((resource, index) => (
            <div key={`${resource.path}-${index}`} className="rounded-lg border border-border/60 bg-background/40 p-2">
              <div className="flex items-center gap-2">
                <Input
                  value={resource.path}
                  onChange={(event) => onUpdateResource(index, { path: event.target.value })}
                  placeholder="references/context.md"
                  className="h-8 font-mono text-[11px]"
                />
                <button
                  onClick={() => onRemoveResource(index)}
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label="删除资源文件"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Textarea
                value={resource.content}
                onChange={(event) => onUpdateResource(index, { content: event.target.value })}
                spellCheck={false}
                className="mt-2 min-h-24 resize-y font-mono text-[11px] leading-relaxed"
              />
            </div>
          ))}
          {resources.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[12px] text-muted-foreground">
              还没有资源文件。
            </div>
          )}
        </div>
      </div>

      {(warnings.length > 0 || createError) && (
        <div className="space-y-1 rounded-lg border border-border/70 bg-muted/35 p-3 text-[11.5px] leading-relaxed">
          {createError && <div className="font-medium text-destructive">{createError}</div>}
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`} className="text-muted-foreground">
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
