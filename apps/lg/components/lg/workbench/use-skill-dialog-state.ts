"use client"

import { useState } from "react"
import type { Skill, SkillResourceKind, SkillTextResource } from "@/lib/types"
import { createSkill, draftSkill, getSkillDraft, updateSkill } from "@/lib/api"
import {
  createDefaultSkillMd,
  normalizeSkillInputName,
  skillDirectoryName,
  syncSkillMdName,
} from "./skill-pane-utils"

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
  const [editingSkillName, setEditingSkillName] = useState<string | null>(null)
  const [skillName, setSkillName] = useState("novel-skill")
  const [goal, setGoal] = useState("")
  const [triggers, setTriggers] = useState("")
  const [examples, setExamples] = useState("")
  const [resourceKinds, setResourceKinds] = useState<SkillResourceKind[]>(["references", "scripts", "assets"])
  const [skillMd, setSkillMd] = useState(() => createDefaultSkillMd("novel-skill"))
  const [resources, setResources] = useState<SkillTextResource[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
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
    setGoal("")
    setTriggers("")
    setExamples("")
    setResourceKinds(["references", "scripts", "assets"])
    setSkillMd(createDefaultSkillMd("novel-skill"))
    setResources([])
    setWarnings([])
    setCreateError("")
    setSkillMdEdited(false)
    setOpen(true)
  }

  async function openEditSkillDialog(skill: Skill) {
    const directoryName = skillDirectoryName(skill)
    if (!directoryName) return

    setEditingSkillName(directoryName)
    setSkillName(directoryName)
    setGoal("")
    setTriggers("")
    setExamples("")
    setResourceKinds(["references", "scripts", "assets"])
    setSkillMd("")
    setResources([])
    setWarnings([])
    setCreateError("")
    setSkillMdEdited(true)
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

  function handleToggleResourceKind(kind: SkillResourceKind, checked: boolean) {
    setResourceKinds((current) =>
      checked ? Array.from(new Set([...current, kind])) : current.filter((item) => item !== kind),
    )
  }

  async function handleGenerateDraft() {
    setGenerating(true)
    setCreateError("")
    try {
      const draft = await draftSkill(bookId, {
        nameHint: skillName,
        goal,
        triggers,
        examples,
        resourceKinds,
      })
      setSkillName(draft.name)
      setSkillMd(draft.skillMd)
      setResources(draft.resources)
      setWarnings(draft.warnings)
      setSkillMdEdited(false)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "生成草稿失败。")
    } finally {
      setGenerating(false)
    }
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

  function handleAddResource(kind: SkillResourceKind = "references") {
    setResources((current) => [
      ...current,
      {
        path: `${kind}/notes-${current.length + 1}.md`,
        content: "# 说明\n\n",
      },
    ])
  }

  function handleUpdateResource(index: number, patch: Partial<SkillTextResource>) {
    setResources((current) =>
      current.map((resource, currentIndex) =>
        currentIndex === index ? { ...resource, ...patch } : resource,
      ),
    )
  }

  function handleRemoveResource(index: number) {
    setResources((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function handleCancel() {
    setOpen(false)
    setEditingSkillName(null)
  }

  return {
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
    handleOpenChange,
    handleSkillNameChange,
    handleSkillNameBlur: () => setSkillName((current) => normalizeSkillInputName(current) || "novel-skill"),
    setGoal,
    setTriggers,
    setExamples,
    handleToggleResourceKind,
    handleGenerateDraft,
    handleSkillMdChange: (value: string) => {
      setSkillMd(value)
      setSkillMdEdited(true)
    },
    handleAddResource,
    handleUpdateResource,
    handleRemoveResource,
    handleCancel,
    handleSaveSkill,
    openCreateSkillDialog,
    openEditSkillDialog,
  }
}
