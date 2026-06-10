"use client"

import { useMemo, useState } from "react"
import { Check, FileText, Search } from "lucide-react"
import { importedMaterialToReference, settingCardToReference } from "@/lib/chat-references"
import type { ChatReference, ImportedMaterial, SettingCard } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { ChatCitation } from "./types"

export function ReferencePicker({
  cards,
  materials,
  citations,
  onAddCitation,
  onRemoveCitation,
}: {
  cards: SettingCard[]
  materials: ImportedMaterial[]
  citations: ChatCitation[]
  onAddCitation: (reference: ChatReference) => void
  onRemoveCitation: (cardId: string) => void
}) {
  const [query, setQuery] = useState("")
  const selectedIds = new Set(citations.map((reference) => reference.id))
  const needle = query.trim().toLowerCase()
  const settingReferences = useMemo(() => cards.map(settingCardToReference), [cards])
  const materialReferences = useMemo(() => materials.map(importedMaterialToReference), [materials])
  const filteredSettings = settingReferences.filter((reference) => matchesReference(reference, needle))
  const filteredMaterials = materialReferences.filter((reference) => matchesReference(reference, needle))
  const isEmpty = filteredSettings.length === 0 && filteredMaterials.length === 0

  return (
    <div
      data-chat-popover-keepopen="true"
      className="border-b border-border/60 bg-popover/95 px-3 py-3 text-[12px] text-popover-foreground shadow-sm"
    >
      <div className="mb-2 font-medium text-foreground">引用上下文</div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索设定卡或导入材料"
          className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
        />
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
        <ReferenceSection
          title="设定卡"
          references={filteredSettings}
          selectedIds={selectedIds}
          onAddCitation={onAddCitation}
          onRemoveCitation={onRemoveCitation}
        />
        <ReferenceSection
          title="导入材料"
          references={filteredMaterials}
          selectedIds={selectedIds}
          onAddCitation={onAddCitation}
          onRemoveCitation={onRemoveCitation}
        />
        {isEmpty && (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-center text-[12px] text-muted-foreground">
            暂无匹配引用
          </div>
        )}
      </div>
    </div>
  )
}

function matchesReference(reference: ChatReference, needle: string): boolean {
  if (!needle) return true
  return `${reference.name} ${reference.summary} ${reference.type} ${reference.path ?? ""}`.toLowerCase().includes(needle)
}

function ReferenceSection({
  title,
  references,
  selectedIds,
  onAddCitation,
  onRemoveCitation,
}: {
  title: string
  references: ChatReference[]
  selectedIds: Set<string>
  onAddCitation: (reference: ChatReference) => void
  onRemoveCitation: (cardId: string) => void
}) {
  if (references.length === 0) {
    return null
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>{title}</span>
        <span className="font-mono tracking-normal">{references.length}</span>
      </div>
      <div className="space-y-1">
        {references.map((reference) => {
          const selected = selectedIds.has(reference.id)
          return (
            <button
              key={reference.id}
              type="button"
              onClick={() => selected ? onRemoveCitation(reference.id) : onAddCitation(reference)}
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
                {selected ? <Check className="h-3 w-3" /> : reference.kind === "material" ? <FileText className="h-3 w-3 text-muted-foreground/70" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-foreground">{reference.name}</span>
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {reference.kind === "material" ? "material" : reference.type}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {reference.summary}
                </span>
                {reference.path && (
                  <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground/70">
                    {reference.path}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
