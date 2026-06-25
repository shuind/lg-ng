"use client"

import { PanelLeft, PanelRight } from "lucide-react"

type MobileTopBarProps = {
  title: string
  onOpenLeft: () => void
  onOpenRight: () => void
}

export function MobileTopBar({ title, onOpenLeft, onOpenRight }: MobileTopBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/85 px-2 py-2 backdrop-blur md:hidden">
      <button
        type="button"
        onClick={onOpenLeft}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        aria-label="打开书籍与章节"
      >
        <PanelLeft className="h-4.5 w-4.5" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-center font-serif text-[15px] tracking-wide text-foreground">
        {title}
      </h1>
      <button
        type="button"
        onClick={onOpenRight}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        aria-label="打开项目状态"
      >
        <PanelRight className="h-4.5 w-4.5" />
      </button>
    </div>
  )
}
