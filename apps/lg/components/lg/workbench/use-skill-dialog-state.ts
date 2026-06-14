"use client"

import { useState } from "react"
import type { Skill, SkillDraftResponse, SkillTextResource } from "@/lib/types"
import { createSkill, draftSkill, getSkillDraft, updateSkill } from "@/lib/api"
import {
  createDefaultSkillMd,
  normalizeSkillInputName,
  skillDirectoryName,
  syncSkillMdName,
} from "./skill-pane-utils"

export type SkillDialogStep = "intent" | "preview"

export function useSkillDialogState({
  bookId,
  onReloadSkills,
  onOpenFile,
}: {
  bookId: string
  onReloadSkills: (showLoading?: boolean) => Promise<void>
  onOpenFile: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<SkillDialogStep>("intent")
  const [editingSkillName, setEditingSkillName] = useState<string | null>(null)
  const [skillName, setSkillName] = useState("novel-skill")
  const [intent, setIntent] = useState("")
  const [skillMd, setSkillMd] = useState(() => createDefaultSkillMd("novel-skill"))
  const [resources, setResources] = useState<SkillTextResource[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [hint, setHint] = useState("")
  const [createError, setCreateError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [savingSkill, setSavingSkill] = useState(false)
  const [loadingSkillDraft, setLoadingSkillDraft] = useState(false)
  const [skillMdEdited, setSkillMdEdited] = useState(false)
  const isEditingSkill = editingSkillName !== null

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setEditingSkillName(null)
  }

  function handleSkillNameChange(value: string) {
    const previousName = normalizeSkillInputName(skillName) || editingSkillName || "novel-skill"
    const nextName = normalizeSkillInputName(value) || "novel-skill"
    setSkillName(value)
    if (editingSkillName) {
      setSkillMd((current) => syncSkillMdName(current, nextName, previousName))
      return
    }
    if (!skillMdEdited) {
      setSkillMd(createDefaultSkillMd(nextName))
    }
  }

  function openCreateSkillDialog() {
    setEditingSkillName(null)
    setSkillName("novel-skill")
    setIntent("")
    setSkillMd(createDefaultSkillMd("novel-skill"))
    setResources([])
    setWarnings([])
    setHint("")
    setCreateError("")
    setSkillMdEdited(false)
    setStep("intent")
    setOpen(true)
  }

  // Lab "new" suggestion already produced a draft — jump straight to preview.
  function openDraftSkillDialog(draft: SkillDraftResponse) {
    setEditingSkillName(null)
    setIntent("")
    setSkillName(draft.name)
    setSkillMd(draft.skillMd)
    setResources(draft.resources)
    setWarnings(draft.warnings)
    setHint("")
    setCreateError("")
    setSkillMdEdited(true)
    setStep("preview")
    setOpen(true)
  }

  async function loadSkillByName(directoryName: string, nextHint: string) {
    setEditingSkillName(directoryName)
    setSkillName(directoryName)
    setIntent("")
    setSkillMd("")
    setResources([])
    setWarnings([])
    setHint(nextHint)
    setCreateError("")
    setSkillMdEdited(true)
    setStep("preview")
    setOpen(true)
    setLoadingSkillDraft(true)
    try {
      const draft = await getSkillDraft(bookId, directoryName)
      setSkillName(draft.name)
      setSkillMd(draft.skillMd)
      setResources(draft.resources)
      setWarnings(draft.warnings)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "读取 Skill 失败。")
    } finally {
      setLoadingSkillDraft(false)
    }
  }

  async function openEditSkillDialog(skill: Skill) {
    const directoryName = skillDirectoryName(skill)
    if (!directoryName) return
    await loadSkillByName(directoryName, "")
  }

  // Lab "improve" suggestion — open the target skill with the proposed change as a banner.
  async function openImproveSkillDialog(directoryName: string, proposedChange: string) {
    await loadSkillByName(directoryName, proposedChange)
  }

  async function handleGenerateDraft() {
    setGenerating(true)
    setCreateError("")
    try {
      const draft = await draftSkill(bookId, { nameHint: skillName, goal: intent })
      setSkillName(draft.name)
      setSkillMd(draft.skillMd)
      setResources(draft.resources)
      setWarnings(draft.warnings)
      setSkillMdEdited(false)
      setStep("preview")
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "生成草稿失败。")
    } finally {
      setGenerating(false)
    }
  }

  function skipToManualDraft() {
    const name = normalizeSkillInputName(skillName) || "novel-skill"
    if (!skillMdEdited) setSkillMd(createDefaultSkillMd(name))
    setStep("preview")
  }

  async function handleSaveSkill() {
    setSavingSkill(true)
    setCreateError("")
    try {
      const input = {
        name: normalizeSkillInputName(skillName),
        skillMd,
        resources,
      }
      const skill = editingSkillName
        ? await updateSkill(bookId, { ...input, originalName: editingSkillName })
        : await createSkill(bookId, input)
      await onReloadSkills(false)
      setOpen(false)
      setEditingSkillName(null)
      onOpenFile(skill.sourceFile)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "保存 Skill 失败。")
    } finally {
      setSavingSkill(false)
    }
  }

  function handleAddResource() {
    setResources((current) => [
      ...current,
      { path: `references/notes-${current.length + 1}.md`, content: "# 说明\n\n" },
    ])
  }

  function handleUpdateResource(index: number, patch: Partial<SkillTextResource>) {
    setResources((current) =>
      current.map((resource, currentIndex) => (currentIndex === index ? { ...resource, ...patch } : resource)),
    )
  }

  function handleRemoveResource(index: number) {
    setResources((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  return {
    open,
    step,
    isEditingSkill,
    skillName,
    intent,
    skillMd,
    resources,
    warnings,
    hint,
    createError,
    generating,
    savingSkill,
    loadingSkillDraft,
    setIntent,
    handleOpenChange,
    handleSkillNameChange,
    handleSkillNameBlur: () => setSkillName((current) => normalizeSkillInputName(current) || "novel-skill"),
    handleGenerateDraft,
    skipToManualDraft,
    handleSkillMdChange: (value: string) => {
      setSkillMd(value)
      setSkillMdEdited(true)
    },
    handleAddResource,
    handleUpdateResource,
    handleRemoveResource,
    handleCancel: () => {
      setOpen(false)
      setEditingSkillName(null)
    },
    handleSaveSkill,
    openCreateSkillDialog,
    openEditSkillDialog,
    openImproveSkillDialog,
    openDraftSkillDialog,
  }
}

export type SkillDialogController = ReturnType<typeof useSkillDialogState>
