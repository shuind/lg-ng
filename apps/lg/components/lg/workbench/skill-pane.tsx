"use client"

import { LoadingPane } from "./shared"
import { SkillDialog } from "./skill-dialog"
import { SkillList } from "./skill-list"
import { SkillPaneHeader } from "./skill-pane-header"
import { useSkillData } from "./use-skill-data"
import { useSkillDialogState } from "./use-skill-dialog-state"

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

  if (loading) return <LoadingPane />

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin px-10 py-6">
      <div className="mx-auto max-w-5xl">
        <SkillPaneHeader skillCount={skills.length} onCreateSkill={dialog.openCreateSkillDialog} />

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
          onEdit={dialog.openEditSkillDialog}
          onRefresh={refreshStyleGuide}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  )
}
