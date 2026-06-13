"use client"

import type { ReactNode } from "react"
import { ArrowLeft, BookText, CheckCircle2, Circle, FileText, PenLine, Save, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Tab } from "./types"

export function WorkbenchHeader({
  bookTitle,
  tab,
  dirty,
  savedAt,
  onClose,
  onTabChange,
  onSave,
}: {
  bookTitle: string
  tab: Tab
  dirty: boolean
  savedAt: string
  onClose: () => void
  onTabChange: (tab: Tab) => void
  onSave: () => void
}) {
  return (
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
        <span className="font-serif text-[14px] tracking-wide text-foreground">{bookTitle}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">/ 工作台</span>
      </div>

      <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 p-0.5 backdrop-blur">
        <TopTab active={tab === "editor"} onClick={() => onTabChange("editor")} icon={<PenLine className="h-3 w-3" />}>
          编辑器
        </TopTab>
        <TopTab active={tab === "ledger"} onClick={() => onTabChange("ledger")} icon={<FileText className="h-3 w-3" />}>
          变更记录
        </TopTab>
        <TopTab active={tab === "skill"} onClick={() => onTabChange("skill")} icon={<Sparkles className="h-3 w-3" />}>
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
              onClick={onSave}
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
  icon: ReactNode
  children: ReactNode
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
