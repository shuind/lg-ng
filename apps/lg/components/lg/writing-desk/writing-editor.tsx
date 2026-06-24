"use client"

export function WritingEditor({
  content,
  onContentChange,
}: {
  content: string
  onContentChange: (content: string) => void
}) {
  return (
    <div className="paper relative min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card/85 shadow-sm backdrop-blur scrollbar-thin">
      <textarea
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="正文..."
        className="mx-auto block h-full w-full max-w-[44rem] resize-none bg-transparent px-8 py-10 font-serif text-[16.5px] leading-[1.95] text-foreground placeholder:text-muted-foreground/60 focus:outline-none sm:px-6"
      />
    </div>
  )
}
