"use client"

import { useState, useRef, useEffect } from "react"
import {
  BookOpen,
  Plus,
  FileText,
  BookMarked,
  ArrowLeft,
  Settings,
  Sparkles,
  LayoutGrid,
  PanelLeftClose,
  PanelLeft,
  Pencil,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Book, Chapter, OutlineFile } from "@/lib/mock-data"
import { ThemeToggle } from "@/components/theme-toggle"

interface LeftSidebarProps {
  books: Book[]
  chapters: Chapter[]
  outlines: OutlineFile[]
  activeBookId: string
  activeChapterId: string | null
  mode: "chat" | "writing" | "workbench"
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelectBook: (id: string) => void
  onSelectChapter: (id: string) => void
  onBackToChat: () => void
  onNewBook: () => void
  onNewChapter: () => void
  onOpenWorkbench: (bookId: string, path?: string) => void
  onRenameBook: (bookId: string, newTitle: string) => void
}

export function LeftSidebar({
  books,
  chapters,
  outlines,
  activeBookId,
  activeChapterId,
  mode,
  collapsed,
  onToggleCollapsed,
  onSelectBook,
  onSelectChapter,
  onBackToChat,
  onNewBook,
  onNewChapter,
  onOpenWorkbench,
  onRenameBook,
}: LeftSidebarProps) {
  const [editingBookId, setEditingBookId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingBookId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingBookId])

  function startRename(bookId: string, currentTitle: string) {
    setEditingBookId(bookId)
    setEditValue(currentTitle)
  }

  function commitRename() {
    if (editingBookId && editValue.trim()) {
      onRenameBook(editingBookId, editValue.trim())
    }
    setEditingBookId(null)
  }
  if (collapsed) {
    return (
      <aside className="relative flex h-full min-h-0 w-full flex-col items-center gap-1 bg-sidebar/80 paper-soft py-4">
        <button
          onClick={onToggleCollapsed}
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          title="展开侧栏"
          aria-label="展开侧栏"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="my-2 h-px w-6 bg-border/70" />
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-thin">
          {books.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBook(b.id)}
              className={cn(
                "group relative flex h-9 w-9 items-center justify-center rounded-lg transition",
                b.id === activeBookId && mode !== "workbench"
                  ? "bg-sidebar-accent text-foreground ring-1 ring-border/60"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
              title={b.title}
            >
              <BookOpen className="h-4 w-4" />
            </button>
          ))}
          <button
            onClick={onNewBook}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            title="新建书籍"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          title="设置"
        >
          <Settings className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col bg-sidebar/80 paper-soft">
      {/* 顶部品牌 */}
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative h-7 w-7 rounded-lg bg-gradient-to-br from-accent/40 to-accent/10 ring-1 ring-border/60">
              <Sparkles className="absolute inset-0 m-auto h-3.5 w-3.5 text-accent-foreground/80" />
            </div>
            <div className="leading-tight">
              <div className="font-serif text-[15px] font-medium tracking-wide text-foreground">LG</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Atelier</div>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <button
              onClick={onToggleCollapsed}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
              aria-label="折叠侧栏"
              title="折叠侧栏"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* 主区滚动 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
        {/* 书籍区 */}
        <Section
          title="书籍"
          actions={
            <button
              onClick={onNewBook}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
              aria-label="新建书籍"
              title="新建书籍"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          }
        >
          {books.map((b) => {
            const active = b.id === activeBookId && mode !== "workbench"
            const isEditing = editingBookId === b.id
            return (
              <div
                key={b.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg pr-1 transition",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {isEditing ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2">
                    <input
                      ref={editRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename()
                        if (e.key === "Escape") setEditingBookId(null)
                      }}
                      className="flex-1 bg-transparent text-[13px] outline-none ring-1 ring-ring rounded px-1"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex shrink-0 items-center gap-0.5 pl-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenWorkbench(b.id)
                        }}
                        className={cn(
                          "rounded-md p-1 transition",
                          active
                            ? "text-muted-foreground opacity-100 hover:bg-background/40 hover:text-foreground"
                            : "text-muted-foreground/0 group-hover:text-muted-foreground group-hover:opacity-100 hover:bg-sidebar-accent hover:text-foreground",
                        )}
                        aria-label="打开工作台"
                        title="打开这本书的工作台"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startRename(b.id, b.title)
                        }}
                        className={cn(
                          "rounded-md p-1 transition",
                          active
                            ? "text-muted-foreground opacity-100 hover:bg-background/40 hover:text-foreground"
                            : "text-muted-foreground/0 group-hover:text-muted-foreground group-hover:opacity-100 hover:bg-sidebar-accent hover:text-foreground",
                        )}
                        aria-label="重命名"
                        title="重命名书籍"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => onSelectBook(b.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2 text-left text-[13px]"
                    >
                      <span className="min-w-0 flex-1 truncate">{b.title}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">{b.updatedAt}</span>
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </Section>

        <div className="mt-4">
          <Section title="大纲">
            {outlines.length > 0 ? outlines.map((outline) => (
                <button
                  key={outline.id}
                  onClick={() => onOpenWorkbench(activeBookId, outline.path)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted-foreground transition hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase",
                      outline.level === "volume"
                        ? "bg-accent/15 text-accent-foreground"
                        : "bg-muted/60 text-muted-foreground",
                    )}
                  >
                    {outline.level === "volume" ? "卷" : "章"}
                  </span>
                  <BookMarked className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 truncate font-serif">{outline.title}</span>
                </button>
              )) : (
              <div className="rounded-lg px-2.5 py-2 text-[12px] leading-relaxed text-muted-foreground/70">
                保存卷纲或章纲后会显示在这里。
              </div>
            )}
          </Section>
        </div>

        {/* 章节区 */}
        <div className="mt-4">
          <Section
            title="章节"
            actions={
              <button
                onClick={onNewChapter}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
                aria-label="新建章节"
                title="新建章节"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          >
            {chapters.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectChapter(c.id)}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
                  c.id === activeChapterId && mode === "writing"
                    ? "bg-sidebar-accent text-foreground ring-1 ring-border/60"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    c.status === "done" && "bg-chart-2",
                    c.status === "writing" && "bg-accent animate-pulse-dot",
                    c.status === "draft" && "bg-border",
                  )}
                />
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate font-serif">{c.title}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/60">
                  {c.wordCount > 0 ? `${(c.wordCount / 1000).toFixed(1)}k` : "—"}
                </span>
              </button>
            ))}
          </Section>
        </div>
      </div>

      {/* 底部固定 */}
      <div className="shrink-0 border-t border-border/60 bg-sidebar/40 px-3 py-3">
        {mode === "writing" ? (
          <button
            onClick={onBackToChat}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回对话
          </button>
        ) : (
          <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground">
            <Settings className="h-3.5 w-3.5" />
            设置
          </button>
        )}
      </div>
    </aside>
  )
}

function Section({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
          {title}
        </span>
        <div className="flex items-center gap-0.5">{actions}</div>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}
