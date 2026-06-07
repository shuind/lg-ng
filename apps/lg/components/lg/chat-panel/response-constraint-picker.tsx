"use client"

import { useState } from "react"
import { Plus, Search } from "lucide-react"
import type { ResponseConstraint } from "@/lib/types"
import { ResponseConstraintDraftForm } from "./response-constraint-draft-form"
import { ResponseConstraintItem } from "./response-constraint-item"
import { TemporaryConstraintInput } from "./temporary-constraint-input"

export function ResponseConstraintPicker({
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
        <ResponseConstraintDraftForm
          draftTitle={draftTitle}
          draftInstruction={draftInstruction}
          saving={saving}
          onTitleChange={setDraftTitle}
          onInstructionChange={setDraftInstruction}
          onCancel={() => setEditingId(null)}
          onSave={saveDraft}
        />
      )}

      <div className="max-h-52 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
        {filteredConstraints.map((constraint) => {
          const active = activeIds.includes(constraint.id)
          return (
            <ResponseConstraintItem
              key={constraint.id}
              constraint={constraint}
              active={active}
              onToggle={() => onToggle(constraint.id)}
              onEdit={() => startEdit(constraint)}
              onDelete={() => deleteConstraint(constraint)}
            />
          )
        })}
        {filteredConstraints.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
            暂无匹配约束
          </div>
        )}
      </div>

      <TemporaryConstraintInput
        value={temporaryText}
        onValueChange={setTemporaryText}
        onAdd={addTemporary}
      />
    </div>
  )
}
