"use client"

export function WritingEditor({
  content,
  onContentChange,
}: {
  content: string
  onContentChange: (content: string) => void
}) {
  return (
    <div className="paper relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70 bg-card/80 backdrop-blur">
      <textarea
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="正文..."
        className="h-full w-full resize-none overflow-y-auto bg-transparent px-10 py-8 font-serif text-[16px] leading-[1.9] text-foreground scrollbar-thin placeholder:text-muted-foreground/60 focus:outline-none"
      />
    </div>
  )
}
