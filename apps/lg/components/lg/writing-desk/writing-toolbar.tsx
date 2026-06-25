"use client"

import { Bold, Heading1, Heading2, Italic, Link as LinkIcon, Quote } from "lucide-react"

export function WritingToolbar() {
  return (
    <div className="mx-8 mt-3 flex items-center gap-0.5 rounded-lg border border-border/60 bg-card/50 px-1.5 py-1 backdrop-blur">
      <ToolButton icon={<Bold className="h-3.5 w-3.5" />} />
      <ToolButton icon={<Italic className="h-3.5 w-3.5" />} />
      <Separator />
      <ToolButton icon={<Heading1 className="h-3.5 w-3.5" />} />
      <ToolButton icon={<Heading2 className="h-3.5 w-3.5" />} />
      <Separator />
      <ToolButton icon={<Quote className="h-3.5 w-3.5" />} />
      <ToolButton icon={<LinkIcon className="h-3.5 w-3.5" />} />
    </div>
  )
}

function ToolButton({ icon }: { icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      {icon}
    </button>
  )
}

function Separator() {
  return <div className="mx-1 h-4 w-px bg-border" />
}
