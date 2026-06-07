"use client"

import { useEffect, useMemo, useState } from "react"
import type { WorkbenchGroup } from "@/lib/mock-data"
import { listWorkbenchTree, readWorkbenchFile, writeWorkbenchFile } from "@/lib/api"
import { EditorPane } from "./editor-pane"
import { LedgerPane } from "./ledger-pane"
import { SkillPane } from "./skill-pane"
import type { Tab, WorkbenchProps } from "./types"
import { WorkbenchFileSidebar } from "./workbench-file-sidebar"
import { WorkbenchHeader } from "./workbench-header"
import { filterWorkbenchTree, findFirstWorkbenchFile, findWorkbenchFile, formatWorkbenchTimestamp } from "./workbench-utils"

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

  // load tree, then auto-select first file if no activePath
  useEffect(() => {
    listWorkbenchTree(book.id).then((t) => {
      setTree(t)
      setActivePath((prev) => {
        if (prev) return prev
        return findFirstWorkbenchFile(t)
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
        setSavedAt(formatWorkbenchTimestamp(updatedAt))
      }
    })
  }, [book.id, activePath])

  const dirty = content !== savedContent
  const activeFile = useMemo(() => findWorkbenchFile(tree, activePath), [tree, activePath])

  async function handleSave() {
    const result = await writeWorkbenchFile(book.id, activePath, content)
    setSavedContent(content)
    setSavedAt(formatWorkbenchTimestamp(result.updatedAt))
    // refresh tree so file timestamps update
    listWorkbenchTree(book.id).then(setTree)
    // refresh ledger
    setLedgerKey((k) => k + 1)
  }

  function openFileInEditor(path: string) {
    setActivePath(path)
    setTab("editor")
  }

  const filteredTree = useMemo(() => filterWorkbenchTree(tree, query), [tree, query])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/98 animate-in fade-in duration-200">
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-[var(--light-warm)] opacity-50 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-[var(--light-cool)] opacity-30 blur-3xl dark:opacity-20" />
      </div>

      <WorkbenchHeader
        bookTitle={book.title}
        tab={tab}
        dirty={dirty}
        savedAt={savedAt}
        onClose={onClose}
        onTabChange={setTab}
        onSave={handleSave}
      />

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

        <WorkbenchFileSidebar
          groups={filteredTree}
          activePath={activePath}
          query={query}
          onQueryChange={setQuery}
          onSelectFile={setActivePath}
        />
      </div>
    </div>
  )
}
