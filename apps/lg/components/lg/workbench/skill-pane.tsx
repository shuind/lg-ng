"use client"

import { useState } from "react"
import type { Skill } from "@/lib/types"
import { deleteSkill } from "@/lib/api"
import { LoadingPane } from "./shared"
import { SkillDialog } from "./skill-dialog"
import { SkillList } from "./skill-list"
import { SkillPaneHeader } from "./skill-pane-header"
import { useSkillData } from "./use-skill-data"
import { useSkillDialogState } from "./use-skill-dialog-state"
import { skillDirectoryName, skillDisplayName } from "./skill-pane-utils"

export function SkillPane({ bookId, onOpenFile }: { bookId: string; onOpenFile: (path: string) => void }) {
  const { skills, loading, loadSkillData } = useSkillData(bookId)
  const dialog = useSkillDialogState({ bookId, onReloadSkills: loadSkillData, onOpenFile })
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null)
  const [skillError, setSkillError] = useState("")

  async function handleDeleteSkill(skill: Skill) {
    const directoryName = skillDirectoryName(skill)
    if (!directoryName) return

    const confirmed = window.confirm(
      `删除 Skill「${skillDisplayName(skill)}」？这会移除 .novel-guide/skills/${directoryName} 目录及其中资源文件。`,
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
      <div className="mx-auto max-w-3xl">
        <SkillPaneHeader skillCount={skills.length} onCreateSkill={dialog.openCreateSkillDialog} />

        <SkillList
          skills={skills}
          deletingSkillId={deletingSkillId}
          error={skillError}
          onEdit={dialog.openEditSkillDialog}
          onDelete={handleDeleteSkill}
          onOpenFile={onOpenFile}
        />

        <SkillDialog dialog={dialog} />
      </div>
    </div>
  )
}
