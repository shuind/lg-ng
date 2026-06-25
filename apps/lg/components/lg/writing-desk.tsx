"use client"

import { useCallback, useEffect, useState } from "react"
import type { Skill } from "@/lib/types"
import { generateDraft, getChapter, listSkills, saveChapter } from "@/lib/api"
import { DraftSandbox } from "./writing-desk/draft-sandbox"
import { WritingDeskHeader } from "./writing-desk/writing-desk-header"
import { WritingDeskNotFound } from "./writing-desk/writing-desk-not-found"
import { WritingEditor } from "./writing-desk/writing-editor"
import { WritingToolbar } from "./writing-desk/writing-toolbar"

interface WritingDeskProps {
  bookId: string
  chapterId: string
}

export function WritingDesk({ bookId, chapterId }: WritingDeskProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [draft, setDraft] = useState<string>("")
  const [draftIntent, setDraftIntent] = useState("")
  const [skills, setSkills] = useState<Skill[]>([])
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const applySkills = useCallback((items: Skill[]) => {
    setSkills(items)
    setDraftSkillIds((current) => current.filter((id) => items.some((skill) => skill.id === id && skill.kind === "writing")))
  }, [])

  const refreshSkills = useCallback(async () => {
    try {
      const items = await listSkills(bookId)
      applySkills(items)
    } catch {
      setSkills([])
      setDraftSkillIds([])
    }
  }, [applySkills, bookId])

  useEffect(() => {
    let cancelled = false
    listSkills(bookId)
      .then((items) => {
        if (cancelled) return
        applySkills(items)
      })
      .catch(() => {
        if (!cancelled) {
          setSkills([])
          setDraftSkillIds([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [applySkills, bookId])

  useEffect(() => {
    setNotFound(false)
    setSavedAt(null)
    getChapter(bookId, chapterId).then((chapter) => {
      if (!chapter.content && !chapter.title) {
        setNotFound(true)
        return
      }
      setTitle(chapter.title)
      setContent(chapter.content)
      setDraft("")
      setDraftIntent("")
      setDraftSkillIds([])
    })
  }, [bookId, chapterId])

  useEffect(() => {
    if (!content || notFound) return
    const timer = setTimeout(() => {
      saveChapter(bookId, chapterId, content).then((response) =>
        setSavedAt(
          new Date(response.updatedAt).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        ),
      )
    }, 2000)
    return () => clearTimeout(timer)
  }, [content, bookId, chapterId, notFound])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const promptParts = [
        draft ? `已有试写内容：\n${draft}\n\n请继续生成，不要重复已有试写。` : "",
        draftIntent.trim() ? `本次写作意图：\n${draftIntent.trim()}` : "",
      ].filter(Boolean)
      const text = await generateDraft(
        bookId,
        chapterId,
        promptParts.length > 0 ? promptParts.join("\n\n") : undefined,
        draftSkillIds,
      )
      setDraft((previousDraft) => (previousDraft ? previousDraft + "\n\n" + text : text))
    } finally {
      setGenerating(false)
    }
  }

  function handleToggleDraftSkill(skillId: string) {
    setDraftSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId],
    )
  }

  function handleAppendDraft() {
    const cleaned = draft.replace(/^（试写）/, "").trim()
    if (!cleaned) return
    setContent((previousContent) => {
      if (!previousContent) return cleaned
      const separator = previousContent.endsWith("\n\n") ? "" : previousContent.endsWith("\n") ? "\n" : "\n\n"
      return `${previousContent}${separator}${cleaned}`
    })
    setDraft("")
    setDraftIntent("")
  }

  const wordCount = content.replace(/\s/g, "").length

  if (notFound) {
    return <WritingDeskNotFound onRetry={() => setNotFound(false)} />
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      <WritingDeskHeader title={title} wordCount={wordCount} savedAt={savedAt} />
      <WritingToolbar />

      <div className="flex-1 overflow-hidden px-8 pt-3 pb-6">
        <div className="flex h-full flex-col gap-3">
          <WritingEditor content={content} onContentChange={setContent} />
          <DraftSandbox
            draft={draft}
            intent={draftIntent}
            skills={skills.filter((skill) => skill.kind === "writing")}
            selectedSkillIds={draftSkillIds}
            generating={generating}
            onIntentChange={setDraftIntent}
            onToggleSkill={handleToggleDraftSkill}
            onRefreshSkills={refreshSkills}
            onGenerate={handleGenerate}
            onAppendDraft={handleAppendDraft}
            onClearDraft={() => setDraft("")}
          />
        </div>
      </div>
    </section>
  )
}
