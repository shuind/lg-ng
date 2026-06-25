"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpenCheck, FileText, Loader2 } from "lucide-react"
import type { Chapter } from "@/lib/types"
import { listWorkbenchTree, readWorkbenchFile } from "@/lib/api"

const STATUS_SOURCES = [
  { title: "章节状态", path: "状态追踪/章节状态.md" },
  { title: "当前冲突", path: "状态追踪/当前冲突.md" },
  { title: "角色位置", path: "状态追踪/角色位置.md" },
  { title: "未收伏笔", path: "剧情管理/伏笔清单.md" },
]

interface LoadedStatusSource {
  title: string
  path: string
  content: string
}

export function BookStatusView({
  bookId,
  chapters,
  onOpenFile,
}: {
  bookId: string
  chapters: Chapter[]
  onOpenFile: (path: string) => void
}) {
  const [sources, setSources] = useState<LoadedStatusSource[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!bookId) {
      setSources([])
      return
    }

    setLoading(true)
    listWorkbenchTree(bookId)
      .then(async (groups) => {
        const files = groups.flatMap((group) => group.files)
        const found = STATUS_SOURCES.flatMap((source) => {
          const file = files.find((item) => normalizePath(item.path) === source.path || normalizePath(item.path).endsWith(`/${source.path}`))
          return file ? [{ ...source, path: file.path }] : []
        })
        const loaded = await Promise.all(found.map(async (source) => {
          const { content } = await readWorkbenchFile(bookId, source.path)
          return { ...source, content }
        }))
        if (!cancelled) setSources(loaded)
      })
      .catch(() => {
        if (!cancelled) setSources([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  const chapterStats = useMemo(() => {
    const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
    const done = chapters.filter((chapter) => chapter.status === "done").length
    const writing = chapters.filter((chapter) => chapter.status === "writing").length
    return { totalWords, done, writing, total: chapters.length }
  }, [chapters])

  if (loading) {
    return (
      <div className="mt-14 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在读取书状态
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <section className="rounded-lg border border-border/35 bg-background/30 p-3">
        <div className="flex items-center gap-2 text-[12px] font-medium text-foreground/80">
          <BookOpenCheck className="h-3.5 w-3.5 text-muted-foreground/65" />
          章节进度
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground/75">
          <Metric label="章节" value={`${chapterStats.total}`} />
          <Metric label="总字数" value={`${chapterStats.totalWords.toLocaleString("zh-CN")}`} />
          <Metric label="完成" value={`${chapterStats.done}`} />
          <Metric label="写作中" value={`${chapterStats.writing}`} />
        </div>
      </section>

      {sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/25 px-3 py-7 text-center text-[12px] leading-relaxed text-muted-foreground/70">
          还没有可汇总的状态追踪文件。打开工作台后可在“状态追踪”里维护当前冲突、角色位置和章节状态。
        </div>
      ) : (
        sources.map((source) => (
          <section key={source.path} className="rounded-lg border border-border/35 bg-background/30 p-3">
            <button
              type="button"
              onClick={() => onOpenFile(source.path)}
              className="flex w-full min-w-0 items-center gap-2 text-left text-[12px] font-medium text-foreground/80 transition hover:text-primary"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/65" />
              <span className="min-w-0 flex-1 truncate">{source.title}</span>
            </button>
            <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-muted-foreground/75">
              {extractStatusLines(source.content).map((line, index) => (
                <li key={`${source.path}-${index}`} className="line-clamp-2">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/35 px-2 py-1.5">
      <div className="font-mono text-[12px] text-foreground/85">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground/70">{label}</div>
    </div>
  )
}

function extractStatusLines(content: string): string[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(">"))
    .slice(0, 4)
  return lines.length > 0 ? lines : ["暂无明确条目。"]
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/")
}
