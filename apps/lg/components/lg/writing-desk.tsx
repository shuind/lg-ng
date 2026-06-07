"use client"

import { useEffect, useState } from "react"
import { generateDraft, getChapter, saveChapter } from "@/lib/api"
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
  const [generating, setGenerating] = useState(false)
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

  function handleKeepDraft() {
    setContent((currentContent) => currentContent + "\n\n" + draft.replace(/^（试写）/, ""))
    setDraft("")
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
            generating={generating}
            onGenerate={handleGenerate}
            onKeepDraft={handleKeepDraft}
            onClearDraft={() => setDraft("")}
          />
        </div>
      </div>
    </section>
  )
}
