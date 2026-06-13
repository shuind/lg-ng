"use client"

import { useCallback, useEffect, useState } from "react"
import type { Skill, SkillCandidate } from "@/lib/types"
import {
  deleteSkill,
  dismissSkillCandidate,
  draftSkillCandidate,
  listSkillCandidates,
  refreshSkillCandidates,
} from "@/lib/api"
import { LoadingPane } from "./shared"
import { SkillDialog } from "./skill-dialog"
import { SkillLab } from "./skill-lab"
import { SkillList } from "./skill-list"
import { SkillPaneHeader } from "./skill-pane-header"
import { useSkillData } from "./use-skill-data"
import { useSkillDialogState } from "./use-skill-dialog-state"
import { skillDirectoryName, skillDisplayName } from "./skill-pane-utils"

export function SkillPane({ bookId, onOpenFile }: { bookId: string; onOpenFile: (path: string) => void }) {
  const {
    skills,
    summary,
    loading,
    refreshing,
    styleSkill,
    loadSkillData,
    refreshStyleGuide,
  } = useSkillData(bookId)
  const dialog = useSkillDialogState({
    bookId,
    onReloadSkills: loadSkillData,
    onOpenFile,
  })
  const [candidates, setCandidates] = useState<SkillCandidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(true)
  const [refreshingCandidates, setRefreshingCandidates] = useState(false)
  const [draftingCandidateId, setDraftingCandidateId] = useState<string | null>(null)
  const [candidateError, setCandidateError] = useState("")
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null)
  const [skillError, setSkillError] = useState("")

  const loadCandidates = useCallback(async () => {
    setLoadingCandidates(true)
    setCandidateError("")
    try {
      const payload = await listSkillCandidates(bookId)
      setCandidates(payload.candidates)
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : "读取 Skill 候选失败。")
    } finally {
      setLoadingCandidates(false)
    }
  }, [bookId])

  useEffect(() => {
    void loadCandidates()
  }, [loadCandidates])

  async function handleRefreshCandidates() {
    setRefreshingCandidates(true)
    setCandidateError("")
    try {
      const payload = await refreshSkillCandidates(bookId)
      setCandidates(payload.candidates)
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : "刷新 Skill 候选失败。")
    } finally {
      setRefreshingCandidates(false)
    }
  }

  async function handleDismissCandidate(candidateId: string) {
    setCandidateError("")
    try {
      const payload = await dismissSkillCandidate(bookId, candidateId)
      setCandidates(payload.candidates)
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : "忽略 Skill 候选失败。")
    }
  }

  async function handleDraftCandidate(candidateId: string) {
    setDraftingCandidateId(candidateId)
    setCandidateError("")
    try {
      const draft = await draftSkillCandidate(bookId, candidateId)
      dialog.openDraftSkillDialog(draft)
      await loadCandidates()
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : "从候选生成 Skill 草稿失败。")
    } finally {
      setDraftingCandidateId(null)
    }
  }

  async function handleDeleteSkill(skill: Skill) {
    const directoryName = skillDirectoryName(skill)
    if (!directoryName) return

    const confirmed = window.confirm(
      `删除 Skill「${skillDisplayName(skill)}」？这会移除 .claude/skills/${directoryName} 目录及其中资源文件。`,
    )
    if (!confirmed) return

    setDeletingSkillId(skill.id)
    setSkillError("")
    try {
      await deleteSkill(bookId, directoryName)
      await loadSkillData(false)
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "删除 Skill 失败。")
    } finally {
      setDeletingSkillId(null)
    }
  }

  if (loading) return <LoadingPane />

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin px-10 py-6">
      <div className="mx-auto max-w-5xl">
        <SkillPaneHeader skillCount={skills.length} onCreateSkill={dialog.openCreateSkillDialog} />

        <SkillLab
          candidates={candidates}
          loading={loadingCandidates}
          refreshing={refreshingCandidates}
          draftingId={draftingCandidateId}
          error={candidateError}
          onRefresh={handleRefreshCandidates}
          onDismiss={handleDismissCandidate}
          onDraft={handleDraftCandidate}
        />

        <SkillDialog
          open={dialog.open}
          isEditingSkill={dialog.isEditingSkill}
          skillName={dialog.skillName}
          goal={dialog.goal}
          triggers={dialog.triggers}
          examples={dialog.examples}
          resourceKinds={dialog.resourceKinds}
          skillMd={dialog.skillMd}
          resources={dialog.resources}
          warnings={dialog.warnings}
          createError={dialog.createError}
          generating={dialog.generating}
          savingSkill={dialog.savingSkill}
          loadingSkillDraft={dialog.loadingSkillDraft}
          onOpenChange={dialog.handleOpenChange}
          onSkillNameChange={dialog.handleSkillNameChange}
          onSkillNameBlur={dialog.handleSkillNameBlur}
          onGoalChange={dialog.setGoal}
          onTriggersChange={dialog.setTriggers}
          onExamplesChange={dialog.setExamples}
          onToggleResourceKind={dialog.handleToggleResourceKind}
          onGenerateDraft={dialog.handleGenerateDraft}
          onSkillMdChange={dialog.handleSkillMdChange}
          onAddResource={dialog.handleAddResource}
          onUpdateResource={dialog.handleUpdateResource}
          onRemoveResource={dialog.handleRemoveResource}
          onCancel={dialog.handleCancel}
          onSave={dialog.handleSaveSkill}
        />

        <SkillList
          skills={skills}
          styleSkill={styleSkill}
          summary={summary}
          refreshing={refreshing}
          deletingSkillId={deletingSkillId}
          error={skillError}
          onEdit={dialog.openEditSkillDialog}
          onDelete={handleDeleteSkill}
          onRefresh={refreshStyleGuide}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  )
}
