"use client"

import { useEffect, useMemo, useState } from "react"
import type { WorkbenchGroup } from "@/lib/types"
import { listWorkbenchTree, readWorkbenchFile, writeWorkbenchFile } from "@/lib/api"
import { EditorPane } from "./editor-pane"
import { LedgerPane } from "./ledger-pane"
import { SkillLabPane } from "./skill-lab"
import { SkillPane } from "./skill-pane"
import type { Tab, WorkbenchProps } from "./types"
import { WorkbenchFileSidebar } from "./workbench-file-sidebar"
import { WorkbenchHeader } from "./workbench-header"
import { filterWorkbenchTree, findFirstWorkbenchFile, findWorkbenchFile, formatWorkbenchTimestamp } from "./workbench-utils"

export function Workbench({ book, onClose, initialPath, initialLine, initialTab, initialLedgerEntryId }: WorkbenchProps) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "editor")
  const [tree, setTree] = useState<WorkbenchGroup[]>([])
  const [activePath, setActivePath] = useState<string>("")
  const [activeLine, setActiveLine] = useState<number | undefined>(initialLine)
  const [content, setContent] = useState<string>("")
  const [savedContent, setSavedContent] = useState<string>("")
  const [savedAt, setSavedAt] = useState<string>("")
  const [query, setQuery] = useState("")
  const [ledgerKey, setLedgerKey] = useState(0)

  useEffect(() => {
    if (initialPath) setActivePath(initialPath)
  }, [initialPath])

  useEffect(() => {
    setActiveLine(initialLine)
  }, [initialLine])

  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab])

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

  function openFileInEditor(path: string, line?: number) {
    setActivePath(path)
    setActiveLine(line)
    setTab("editor")
  }

  function selectFile(path: string) {
    setActivePath(path)
    setActiveLine(undefined)
    setTab("editor")
  }

  const filteredTree = useMemo(() => filterWorkbenchTree(tree, query), [tree, query])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/98 animate-in fade-in duration-200">
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
      <div className={tab === "editor"
        ? "relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]"
        : "relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]"
      }>
        {/* 左:主内容 */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          {tab === "editor" && (
            <EditorPane
              file={activeFile}
              content={content}
              onChange={setContent}
              dirty={dirty}
              savedAt={savedAt}
              initialLine={activeLine}
            />
          )}
          {tab === "ledger" && (
            <LedgerPane
              key={ledgerKey}
              bookId={book.id}
              initialEntryId={initialLedgerEntryId}
              onOpenFile={openFileInEditor}
              onChanged={() => {
                listWorkbenchTree(book.id).then(setTree)
                setLedgerKey((k) => k + 1)
              }}
            />
          )}
          {tab === "skill" && <SkillPane bookId={book.id} onOpenFile={openFileInEditor} />}
          {tab === "lab" && <SkillLabPane bookId={book.id} onOpenFile={openFileInEditor} />}
        </div>

        {tab === "editor" && (
          <WorkbenchFileSidebar
            groups={filteredTree}
            activePath={activePath}
            query={query}
            onQueryChange={setQuery}
            onSelectFile={selectFile}
          />
        )}
      </div>
    </div>
  )
}
