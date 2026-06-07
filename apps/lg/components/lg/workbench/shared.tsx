"use client"

export function LoadingPane() {
  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="text-[12px] text-muted-foreground">加载中…</div>
    </div>
  )
}

export function EmptyPane({
  icon,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="paper rounded-2xl border border-border/60 bg-card/60 p-8 text-center backdrop-blur">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-transparent ring-1 ring-border/50 animate-breathe-glow text-accent-foreground/80">
          {icon}
        </div>
        <div className="mt-3 font-serif text-[18px] text-foreground">{title}</div>
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="mt-4 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition hover:opacity-90"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

