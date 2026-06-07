"use client"

import { useEffect, useState } from "react"
import { applyProposal, createProposal, discardProposal, generateDraft, getChapter, saveChapter } from "@/lib/api"
import type { ProposalSummary } from "@/lib/types"
import { DraftSandbox } from "./writing-desk/draft-sandbox"
import { WritingDeskHeader } from "./writing-desk/writing-desk-header"
import { WritingDeskNotFound } from "./writing-desk/writing-desk-not-found"
import { WritingEditor } from "./writing-desk/writing-editor"
import { WritingToolbar } from "./writing-desk/writing-toolbar"

interface WritingDeskProps {
  bookId: string
  chapterId: string
  onProposalApplied: () => Promise<void>
}

export function WritingDesk({ bookId, chapterId, onProposalApplied }: WritingDeskProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [chapterPath, setChapterPath] = useState("")
  const [draft, setDraft] = useState<string>("")
  const [draftProposal, setDraftProposal] = useState<ProposalSummary | null>(null)
  const [generating, setGenerating] = useState(false)
  const [applyingProposal, setApplyingProposal] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

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
      setChapterPath(chapter.path)
      setDraftProposal(null)
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
    const prompt = draft ? `已有试写内容：\n${draft}\n\n请继续续写。` : undefined
    const text = await generateDraft(bookId, chapterId, prompt)
    setDraft((previousDraft) => (previousDraft ? previousDraft + "\n\n" + text : text))
    setGenerating(false)
  }

  async function handleKeepDraft() {
    if (!draft.trim() || !chapterPath) return
    const cleaned = draft.replace(/^（试写）/, "")
    const proposal = await createProposal(bookId, {
      targetPath: chapterPath,
      baseContent: content,
      afterContent: `${content}\n\n${cleaned}`,
      summary: "采纳试写到当前章节",
      source: "draft",
    })
    setDraftProposal(proposal)
    setDraft("")
  }

  async function handleApplyDraftProposal(hunkIds?: string[]) {
    if (!draftProposal || applyingProposal) return
    setApplyingProposal(true)
    try {
      const result = await applyProposal(bookId, draftProposal.id, hunkIds)
      setDraftProposal(result.proposal)
      setContent(result.updatedContent)
      await onProposalApplied()
    } finally {
      setApplyingProposal(false)
    }
  }

  async function handleDiscardDraftProposal() {
    if (!draftProposal || applyingProposal) return
    setApplyingProposal(true)
    try {
      const proposal = await discardProposal(bookId, draftProposal.id)
      setDraftProposal(proposal)
    } finally {
      setApplyingProposal(false)
    }
  }

  const wordCount = content.replace(/\s/g, "").length

  if (notFound) {
    return <WritingDeskNotFound onRetry={() => setNotFound(false)} />
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      <WritingDeskHeader title={title} wordCount={wordCount} savedAt={savedAt} />
      <WritingToolbar />

      <div className="flex-1 overflow-hidden px-10 pt-3 pb-6">
        <div className="flex h-full flex-col gap-3">
          <WritingEditor content={content} onContentChange={setContent} />
          <DraftSandbox
            draft={draft}
            proposal={draftProposal}
            generating={generating}
            applyingProposal={applyingProposal}
            onGenerate={handleGenerate}
            onKeepDraft={handleKeepDraft}
            onApplyProposal={handleApplyDraftProposal}
            onDiscardProposal={handleDiscardDraftProposal}
            onClearDraft={() => setDraft("")}
          />
        </div>
      </div>
    </section>
  )
}
