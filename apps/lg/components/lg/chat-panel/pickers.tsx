"use client"

import { useState } from "react"
import { AtSign, Check, Edit3, Plus, Search, Sparkles, Trash2, XCircle } from "lucide-react"
import type { SettingCard } from "@/lib/mock-data"
import type { ResponseConstraint, Skill } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { ChatCitation } from "./types"

export function CitationBar({
  citations,
  onRemove,
  onClear,
}: {
  citations: ChatCitation[]
  onRemove: (cardId: string) => void
  onClear: () => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>引用上下文</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal transition hover:bg-secondary hover:text-foreground"
        >
          清空
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((card) => (
          <span
            key={card.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-foreground ring-1 ring-border/50"
          >
            <AtSign className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{card.name}</span>
            {card.path && <span className="hidden max-w-[160px] truncate font-mono text-muted-foreground sm:inline">{card.path}</span>}
            <button
              type="button"
              onClick={() => onRemove(card.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除引用 ${card.name}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function ResponseConstraintChipBar({
  constraints,
  temporaryConstraints,
  onRemoveConstraint,
  onRemoveTemporary,
}: {
  constraints: ResponseConstraint[]
  temporaryConstraints: string[]
  onRemoveConstraint: (constraintId: string) => void
  onRemoveTemporary: (index: number) => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">回复约束</div>
      <div className="flex flex-wrap gap-1.5">
        {constraints.map((constraint) => (
          <span
            key={constraint.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-foreground ring-1 ring-border/50"
          >
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{constraint.title}</span>
            <button
              type="button"
              onClick={() => onRemoveConstraint(constraint.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除回复约束 ${constraint.title}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
        {temporaryConstraints.map((instruction, index) => (
          <span
            key={`${instruction}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent/20 px-2 py-1 text-[11px] text-foreground ring-1 ring-accent/30"
          >
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">本轮: {instruction}</span>
            <button
              type="button"
              onClick={() => onRemoveTemporary(index)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="移除本轮临时约束"
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function SkillChipBar({
  skills,
  onRemove,
}: {
  skills: Skill[]
  onRemove: (skillId: string) => void
}) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Skill</div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span
            key={skill.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/5 px-2 py-1 text-[11px] text-foreground ring-1 ring-primary/20"
          >
            <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{skillDisplayName(skill)}</span>
            <span className="hidden rounded bg-muted/60 px-1 text-[10px] text-muted-foreground sm:inline">
              {skillTypeLabel(skill)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(skill.id)}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label={`移除 Skill ${skillDisplayName(skill)}`}
            >
              <XCircle className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function PlusPicker({
  tab,
  onTabChange,
  constraints,
  activeConstraintIds,
  onToggleConstraint,
  onCreateConstraint,
  onUpdateConstraint,
  onDeleteConstraint,
  onAddTemporaryConstraint,
  skills,
  selectedSkillIds,
  onToggleSkill,
}: {
  tab: "constraints" | "skills"
  onTabChange: (tab: "constraints" | "skills") => void
  constraints: ResponseConstraint[]
  activeConstraintIds: string[]
  onToggleConstraint: (constraintId: string) => void
  onCreateConstraint: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdateConstraint: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDeleteConstraint: (constraintId: string) => Promise<void>
  onAddTemporaryConstraint: (instruction: string) => void
  skills: Skill[]
  selectedSkillIds: string[]
  onToggleSkill: (skillId: string) => void
}) {
  return (
    <div
      data-chat-popover-keepopen="true"
      className="border-b border-border/60 bg-popover/95 px-3 py-3 text-[12px] text-popover-foreground shadow-sm"
    >
      <div className="mb-3 inline-flex rounded-lg bg-muted/50 p-0.5">
        <PlusTabButton active={tab === "constraints"} onClick={() => onTabChange("constraints")}>
          约束
        </PlusTabButton>
        <PlusTabButton active={tab === "skills"} onClick={() => onTabChange("skills")}>
          Skill
        </PlusTabButton>
      </div>

      {tab === "constraints" ? (
        <ResponseConstraintPicker
          constraints={constraints}
          activeIds={activeConstraintIds}
          onToggle={onToggleConstraint}
          onCreate={onCreateConstraint}
          onUpdate={onUpdateConstraint}
          onDelete={onDeleteConstraint}
          onAddTemporary={onAddTemporaryConstraint}
        />
      ) : (
        <SkillPicker
          skills={skills}
          selectedIds={selectedSkillIds}
          onToggle={onToggleSkill}
        />
      )}
    </div>
  )
}

function PlusTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-[11px] transition",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function SkillPicker({
  skills,
  selectedIds,
  onToggle,
}: {
  skills: Skill[]
  selectedIds: string[]
  onToggle: (skillId: string) => void
}) {
  return (
    <div className="space-y-2">
      {skills.map((skill) => {
        const selected = selectedIds.includes(skill.id)
        return (
          <button
            key={skill.id}
            type="button"
            onClick={() => onToggle(skill.id)}
            className={cn(
              "flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition",
              selected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40 hover:bg-secondary/60",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {selected && <Check className="h-3 w-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12px] font-medium text-foreground">{skillDisplayName(skill)}</span>
                <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {skillTypeLabel(skill)}
                </span>
                {skill.dirty && (
                  <span className="shrink-0 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-foreground">
                    需刷新
                  </span>
                )}
              </span>
              {skill.description && (
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {skill.description}
                </span>
              )}
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
                {skill.summaryFile || skill.sourceFile}
              </span>
            </span>
          </button>
        )
      })}
      {skills.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
          暂无 Skill
        </div>
      )}
    </div>
  )
}

function skillTypeLabel(skill: Skill): string {
  if (skill.source === "style_guide" || skill.type === "style_guide") return "创作指南"
  if (skill.source === "claude_skill") return "本地 Skill"
  return skill.type
}

function skillDisplayName(skill: Skill): string {
  return skill.name || (skill.type === "style_guide" ? "创作指南" : skill.id)
}

function ResponseConstraintPicker({
  constraints,
  activeIds,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  onAddTemporary,
}: {
  constraints: ResponseConstraint[]
  activeIds: string[]
  onToggle: (constraintId: string) => void
  onCreate: (input: Pick<ResponseConstraint, "title" | "instruction">) => Promise<void>
  onUpdate: (input: Pick<ResponseConstraint, "id" | "title" | "instruction">) => Promise<void>
  onDelete: (constraintId: string) => Promise<void>
  onAddTemporary: (instruction: string) => void
}) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftInstruction, setDraftInstruction] = useState("")
  const [temporaryText, setTemporaryText] = useState("")
  const [saving, setSaving] = useState(false)
  const filteredConstraints = constraints.filter((constraint) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${constraint.title} ${constraint.instruction}`.toLowerCase().includes(needle)
  })

  function startNew() {
    setEditingId("new")
    setDraftTitle("")
    setDraftInstruction("")
  }

  function startEdit(constraint: ResponseConstraint) {
    setEditingId(constraint.id)
    setDraftTitle(constraint.title)
    setDraftInstruction(constraint.instruction)
  }

  async function saveDraft() {
    const title = draftTitle.trim()
    const instruction = draftInstruction.trim()
    if (!title || !instruction || saving) return
    setSaving(true)
    try {
      if (editingId === "new") {
        await onCreate({ title, instruction })
      } else if (editingId) {
        await onUpdate({ id: editingId, title, instruction })
      }
      setEditingId(null)
      setDraftTitle("")
      setDraftInstruction("")
    } finally {
      setSaving(false)
    }
  }

  async function deleteConstraint(constraint: ResponseConstraint) {
    if (!window.confirm(`删除回复约束「${constraint.title}」？`)) return
    await onDelete(constraint.id)
  }

  function addTemporary() {
    const instruction = temporaryText.trim()
    if (!instruction) return
    onAddTemporary(instruction)
    setTemporaryText("")
  }

  return (
    <div className="text-[12px] text-popover-foreground">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-medium text-foreground">回复约束</div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          新建
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索约束"
          className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
        />
      </div>

      {editingId && (
        <div className="mb-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="标题"
            className="w-full rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring/50"
          />
          <textarea
            value={draftInstruction}
            onChange={(event) => setDraftInstruction(event.target.value)}
            placeholder="指令"
            rows={3}
            className="w-full resize-none rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-ring/50"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={!draftTitle.trim() || !draftInstruction.trim() || saving}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] text-background transition hover:opacity-90 disabled:opacity-40"
            >
              <Check className="h-3 w-3" />
              保存
            </button>
          </div>
        </div>
      )}

      <div className="max-h-52 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
        {filteredConstraints.map((constraint) => {
          const active = activeIds.includes(constraint.id)
          return (
            <div
              key={constraint.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2 py-2 transition",
                active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40",
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(constraint.id)}
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                )}
                aria-label={active ? `取消约束 ${constraint.title}` : `启用约束 ${constraint.title}`}
              >
                {active && <Check className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => onToggle(constraint.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-[12px] font-medium text-foreground">{constraint.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {constraint.instruction}
                </div>
              </button>
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={() => startEdit(constraint)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={`编辑 ${constraint.title}`}
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteConstraint(constraint)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label={`删除 ${constraint.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
        {filteredConstraints.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
            暂无匹配约束
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          value={temporaryText}
          onChange={(event) => setTemporaryText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addTemporary()
            }
          }}
          placeholder="本轮临时约束"
          className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
        />
        <button
          type="button"
          onClick={addTemporary}
          disabled={!temporaryText.trim()}
          className="rounded-md bg-foreground px-2.5 py-1 text-[11px] text-background transition hover:opacity-90 disabled:opacity-40"
        >
          添加
        </button>
      </div>
    </div>
  )
}

export function ReferencePicker({
  cards,
  citations,
  onAddCitation,
  onRemoveCitation,
}: {
  cards: SettingCard[]
  citations: ChatCitation[]
  onAddCitation: (card: SettingCard) => void
  onRemoveCitation: (cardId: string) => void
}) {
  const [query, setQuery] = useState("")
  const selectedIds = new Set(citations.map((card) => card.id))
  const filteredCards = cards.filter((card) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${card.name} ${card.summary} ${card.category} ${card.path ?? ""}`.toLowerCase().includes(needle)
  })

  return (
    <div
      data-chat-popover-keepopen="true"
      className="border-b border-border/60 bg-popover/95 px-3 py-3 text-[12px] text-popover-foreground shadow-sm"
    >
      <div className="mb-2 font-medium text-foreground">引用设定</div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索设定卡"
          className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
        />
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
        {filteredCards.map((card) => {
          const selected = selectedIds.has(card.id)
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => selected ? onRemoveCitation(card.id) : onAddCitation(card)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition",
                selected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40 hover:bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                )}
              >
                {selected && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-foreground">{card.name}</span>
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {card.category}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {card.summary}
                </span>
                {card.path && (
                  <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground/70">
                    {card.path}
                  </span>
                )}
              </span>
            </button>
          )
        })}
        {filteredCards.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
            暂无匹配设定
          </div>
        )}
      </div>
    </div>
  )
}

export function ToolBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-secondary hover:text-foreground",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
      )}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  )
}
