"use client"

export function WritingDeskNotFound({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="flex h-full min-h-0 flex-col items-center justify-center gap-4 text-center">
      <div className="text-[13px] text-muted-foreground">章节不存在或已被删除</div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-card px-3 py-1.5 text-[12px] text-foreground ring-1 ring-border transition hover:bg-secondary"
      >
        重试
      </button>
    </section>
  )
}
