"use client"

import { Trash2 } from "lucide-react"
import type { SkillTextResource } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function SkillResourcesEditor({
  resources,
  disabled,
  onAddResource,
  onUpdateResource,
  onRemoveResource,
}: {
  resources: SkillTextResource[]
  disabled?: boolean
  onAddResource: () => void
  onUpdateResource: (index: number, patch: Partial<SkillTextResource>) => void
  onRemoveResource: (index: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11.5px] leading-relaxed text-muted-foreground">
          可选：把较长的规则、参考资料放进 references/、scripts/ 或 assets/ 文件，避免 SKILL.md 过长。大多数 Skill 不需要。
        </div>
        <button
          onClick={onAddResource}
          disabled={disabled}
          className="shrink-0 rounded-md border border-border/70 px-2 py-1 text-[11px] transition hover:bg-secondary disabled:opacity-50"
        >
          添加文本文件
        </button>
      </div>
      {resources.length > 0 && (
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
        </div>
      )}
    </div>
  )
}
