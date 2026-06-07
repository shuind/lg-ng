"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, BookText, CheckCircle2, Circle, FileText, PenLine, Save, Search, Sparkles } from "lucide-react"
import type { WorkbenchGroup } from "@/lib/mock-data"
import { listWorkbenchTree, readWorkbenchFile, writeWorkbenchFile } from "@/lib/api"
import { cn } from "@/lib/utils"
import { EditorPane } from "./editor-pane"
import { FileGroup } from "./file-tree"
import { LedgerPane } from "./ledger-pane"
import { SkillPane } from "./skill-pane"
import type { Tab, WorkbenchProps } from "./types"

export function Workbench({ book, onClose, initialPath }: WorkbenchProps) {
  const [tab, setTab] = useState<Tab>("editor")
  const [tree, setTree] = useState<WorkbenchGroup[]>([])
  const [activePath, setActivePath] = useState<string>("")
  const [content, setContent] = useState<string>("")
  const [savedContent, setSavedContent] = useState<string>("")
  const [savedAt, setSavedAt] = useState<string>("")
  const [query, setQuery] = useState("")
  const [ledgerKey, setLedgerKey] = useState(0)

  useEffect(() => {
    if (initialPath) setActivePath(initialPath)
  }, [initialPath])

  // helper: find first file in tree
  function findFirstFile(groups: WorkbenchGroup[]): string {
    for (const g of groups) {
      if (g.files.length > 0) return g.files[0].path
    }
    return ""
  }

  // load tree, then auto-select first file if no activePath
  useEffect(() => {
    listWorkbenchTree(book.id).then((t) => {
      setTree(t)
      setActivePath((prev) => {
        if (prev) return prev
        return findFirstFile(t)
      })
    })
  }, [book.id])

  // load file content when activePath changes
  useEffect(() => {
    if (!activePath) return
    readWorkbenchFile(book.id, activePath).then(({ content: c, updatedAt }) => {
      setContent(c)
      setSavedContent(c)
      if (updatedAt) {
        setSavedAt(
          new Date(updatedAt).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
      }
    })
  }, [book.id, activePath])

  const dirty = content !== savedContent
  const activeFile = useMemo(() => {
    for (const g of tree) for (const f of g.files) if (f.path === activePath) return f
    return null
  }, [tree, activePath])

  async function handleSave() {
    const result = await writeWorkbenchFile(book.id, activePath, content)
    setSavedContent(content)
    setSavedAt(
      new Date(result.updatedAt).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    )
    // refresh tree so file timestamps update
    listWorkbenchTree(book.id).then(setTree)
    // refresh ledger
    setLedgerKey((k) => k + 1)
  }

  function openFileInEditor(path: string) {
    setActivePath(path)
    setTab("editor")
  }

  const filteredTree = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tree
    return tree
      .map((g) => {
        if (g.label.toLowerCase().includes(q)) return g
        return {
          ...g,
          files: g.files.filter((f) => `${f.name} ${f.path}`.toLowerCase().includes(q)),
        }
      })
      .filter((g) => g.files.length > 0)
  }, [tree, query])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/98 animate-in fade-in duration-200">
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-[var(--light-warm)] opacity-50 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-[var(--light-cool)] opacity-30 blur-3xl dark:opacity-20" />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 px-4 py-2.5 backdrop-blur paper-soft">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          title="返回对话"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </button>
        <span className="h-4 w-px bg-border/80" />
        <div className="flex items-center gap-1.5">
          <BookText className="h-3.5 w-3.5 text-muted-foreground/80" />
          <span className="font-serif text-[14px] tracking-wide text-foreground">{book.title}</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">/ Workbench</span>
        </div>

        {/* Tab 居中 */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 p-0.5 backdrop-blur">
          <TopTab active={tab === "editor"} onClick={() => setTab("editor")} icon={<PenLine className="h-3 w-3" />}>
            编辑器
          </TopTab>
          <TopTab active={tab === "ledger"} onClick={() => setTab("ledger")} icon={<FileText className="h-3 w-3" />}>
            Ledger
          </TopTab>
          <TopTab active={tab === "skill"} onClick={() => setTab("skill")} icon={<Sparkles className="h-3 w-3" />}>
            Skill
          </TopTab>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {tab === "editor" && (
            <>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                {dirty ? (
                  <>
                    <Circle className="h-2.5 w-2.5 fill-accent text-accent animate-pulse-dot" />
                    未保存
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground/70" />
                    {savedAt} 已保存
                  </>
                )}
              </span>
              <button
                onClick={handleSave}
                disabled={!dirty}
                className="flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
              >
                <Save className="h-3 w-3" />
                保存
              </button>
            </>
          )}
        </div>
      </header>

      {/* 主体 */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        {/* 左:主内容 */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          {tab === "editor" && (
            <EditorPane
              file={activeFile}
              content={content}
              onChange={setContent}
              dirty={dirty}
              savedAt={savedAt}
            />
          )}
          {tab === "ledger" && (
            <LedgerPane
              key={ledgerKey}
              bookId={book.id}
              onOpenFile={openFileInEditor}
              onChanged={() => {
                listWorkbenchTree(book.id).then(setTree)
                setLedgerKey((k) => k + 1)
              }}
            />
          )}
          {tab === "skill" && <SkillPane bookId={book.id} onOpenFile={openFileInEditor} />}
        </div>

        {/* 右:文件树 */}
        <aside className="min-h-0 border-l border-border/60 bg-sidebar/80 paper-soft">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 px-3 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索文件或路径"
                  className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
                />
              </div>
              <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/75">项目文件</span>
                <span className="font-mono text-[10px]">{filteredTree.reduce((sum, g) => sum + g.files.length, 0)} 个</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
              {filteredTree.length > 0 ? (
                filteredTree.map((g) => (
                  <FileGroup
                    key={g.id}
                    group={g}
                    activePath={activePath}
                    forceOpen={query.trim().length > 0}
                    onSelect={(p) => setActivePath(p)}
                  />
                ))
              ) : (
                <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">没有找到匹配文件</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function TopTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] transition",
        active
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}

