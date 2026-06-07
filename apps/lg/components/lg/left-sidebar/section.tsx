import type { ReactNode } from "react"

export function SidebarSection({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
          {title}
        </span>
        <div className="flex items-center gap-0.5">{actions}</div>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}
