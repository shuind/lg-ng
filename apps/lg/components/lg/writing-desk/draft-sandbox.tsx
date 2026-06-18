"use client"

import { useState } from "react"
import { Check, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import type { Skill } from "@/lib/types"
import { cn } from "@/lib/utils"

export function DraftSandbox({
  draft,
  intent,
  skills,
  selectedSkillIds,
  generating,
  onIntentChange,
  onToggleSkill,
  onRefreshSkills,
  onGenerate,
  onAppendDraft,
  onClearDraft,
}: {
  draft: string
  intent: string
  skills: Skill[]
  selectedSkillIds: string[]
  generating: boolean
  onIntentChange: (value: string) => void
  onToggleSkill: (skillId: string) => void
  onRefreshSkills: () => void | Promise<void>
  onGenerate: () => void
  onAppendDraft: () => void | Promise<void>
  onClearDraft: () => void
}) {
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)

  return (
    <div className="paper rounded-lg border border-dashed border-border bg-muted/20 backdrop-blur">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span>试写沙盒</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSkillPickerOpen((value) => {
                const nextOpen = !value
                if (nextOpen) void onRefreshSkills()
                return nextOpen
              })
            }}
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition",
              selectedSkillIds.length > 0
                ? "border-primary/40 bg-primary/5 text-foreground"
                : "border-border/70 bg-background/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Sparkles className="h-3 w-3" />
            Skill{selectedSkillIds.length > 0 ? ` · ${selectedSkillIds.length}` : ""}
          </button>
        </div>
        {skillPickerOpen && (
          <div className="mb-2 grid max-h-32 gap-1 overflow-y-auto rounded-md border border-border/60 bg-background/70 p-1.5">
            {skills.map((skill) => {
              const selected = selectedSkillIds.includes(skill.id)
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => onToggleSkill(skill.id)}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition",
                    selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    )}
                  >
                    {selected && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{skill.name || skill.id}</span>
                </button>
              )
            })}
            {skills.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                暂无写作 Skill
              </div>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={intent}
            onChange={(event) => onIntentChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                onGenerate()
              }
            }}
            rows={2}
            placeholder="写下本次意图，例如：续写一段、改得更克制、埋一个伏笔。留空则续写当前章节。"
            className="min-h-14 flex-1 resize-none rounded-md border border-border/70 bg-background/70 px-3 py-2 font-serif text-[13px] leading-relaxed text-foreground outline-none transition focus:border-ring focus:ring-1 focus:ring-ring/40 disabled:opacity-60"
            disabled={generating}
          />
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] text-background transition hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", generating && "animate-spin")} />
            {draft ? "继续生成" : "生成"}
          </button>
        </div>
      </div>
      <div className="min-h-[120px] max-h-[28vh] overflow-y-auto px-6 py-4 font-serif text-[14px] leading-relaxed text-muted-foreground">
        {draft || (
          <span className="italic opacity-60">
            写下意图后生成临时稿，满意后追加到正文。
          </span>
        )}
      </div>
      {draft && (
        <div className="flex items-center justify-end gap-1.5 border-t border-border/60 px-4 py-2">
          <button
            type="button"
            onClick={onAppendDraft}
            className="rounded-md bg-foreground px-2.5 py-1.5 text-[11px] text-background transition hover:opacity-90"
          >
            追加到正文
          </button>
          <button
            type="button"
            onClick={onClearDraft}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            扔掉
          </button>
        </div>
      )}
    </div>
  )
}
