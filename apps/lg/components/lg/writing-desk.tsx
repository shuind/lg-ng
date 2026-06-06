"use client"

import { useState, useEffect } from "react"
import { Bold, Italic, Heading1, Heading2, Quote, Link as LinkIcon, Sparkles, RefreshCw, Trash2, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { generateDraft, getChapter, saveChapter } from "@/lib/api"

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
    getChapter(bookId, chapterId).then((c) => {
      if (!c.content && !c.title) {
        setNotFound(true)
        return
      }
      setTitle(c.title)
      setContent(c.content)
    })
  }, [bookId, chapterId])

  // 自动保存
  useEffect(() => {
    if (!content || notFound) return
    const t = setTimeout(() => {
      saveChapter(bookId, chapterId, content).then((r) =>
        setSavedAt(new Date(r.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })),
      )
    }, 2000)
    return () => clearTimeout(t)
  }, [content, bookId, chapterId, notFound])

  async function handleGenerate() {
    setGenerating(true)
    const prompt = draft ? `已有试写内容：\n${draft}\n\n请继续续写。` : undefined
    const text = await generateDraft(bookId, chapterId, prompt)
    setDraft((prev) => (prev ? prev + "\n\n" + text : text))
    setGenerating(false)
  }

  const wordCount = content.replace(/\s/g, "").length

  if (notFound) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center gap-4 text-center">
        <div className="text-[13px] text-muted-foreground">章节不存在或已被删除</div>
        <button
          onClick={() => setNotFound(false)}
          className="rounded-md bg-card px-3 py-1.5 text-[12px] text-foreground ring-1 ring-border transition hover:bg-secondary"
        >
          重试
        </button>
      </section>
    )
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      {/* 顶栏 */}
      <header className="flex items-center justify-between px-10 pt-6 pb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">写作台</div>
          <h1 className="font-serif text-xl tracking-wide text-foreground">{title}</h1>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{wordCount.toLocaleString()} 字</span>
          {savedAt && (
            <span className="flex items-center gap-1">
              <Save className="h-3 w-3" /> 已保存 {savedAt}
            </span>
          )}
        </div>
      </header>

      {/* 工具栏 */}
      <div className="mx-10 flex items-center gap-0.5 rounded-lg border border-border/60 bg-card/50 px-1.5 py-1 backdrop-blur">
        <ToolBtn icon={<Bold className="h-3.5 w-3.5" />} />
        <ToolBtn icon={<Italic className="h-3.5 w-3.5" />} />
        <Sep />
        <ToolBtn icon={<Heading1 className="h-3.5 w-3.5" />} />
        <ToolBtn icon={<Heading2 className="h-3.5 w-3.5" />} />
        <Sep />
        <ToolBtn icon={<Quote className="h-3.5 w-3.5" />} />
        <ToolBtn icon={<LinkIcon className="h-3.5 w-3.5" />} />
      </div>

      {/* 编辑区 + 沙盒 */}
      <div className="flex-1 overflow-hidden px-10 pt-3 pb-6">
        <div className="flex h-full flex-col gap-3">
          {/* 富文本编辑 */}
          <div className="paper relative flex-1 overflow-y-auto scrollbar-thin rounded-xl border border-border/70 bg-card/80 backdrop-blur">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="正文..."
              className="h-full w-full resize-none bg-transparent px-10 py-8 font-serif text-[16px] leading-[1.9] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>

          {/* 试写沙盒 */}
          <div className="paper rounded-xl border border-dashed border-border bg-muted/20 backdrop-blur">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                试写沙盒
                <span className="text-[10px] opacity-60">临时区域,不写入设定</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1 rounded-md bg-card px-2 py-1 text-[11px] text-foreground ring-1 ring-border transition hover:bg-secondary disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3 w-3", generating && "animate-spin")} />
                  {draft ? "继续生成" : "AI 试写"}
                </button>
                {draft && (
                  <>
                    <button
                      onClick={() => {
                        setContent((c) => c + "\n\n" + draft.replace(/^（试写）/, ""))
                        setDraft("")
                      }}
                      className="rounded-md bg-foreground px-2 py-1 text-[11px] text-background transition hover:opacity-90"
                    >
                      保留到草稿
                    </button>
                    <button
                      onClick={() => setDraft("")}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                      扔掉
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="min-h-[120px] max-h-[28vh] overflow-y-auto px-6 py-4 font-serif text-[14px] leading-relaxed text-muted-foreground">
              {draft || (
                <span className="italic opacity-60">点击「AI 试写」让 Agent 续写一段,满意再保留到正文。</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ToolBtn({ icon }: { icon: React.ReactNode }) {
  return (
    <button className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground">
      {icon}
    </button>
  )
}
function Sep() {
  return <div className="mx-1 h-4 w-px bg-border" />
}
