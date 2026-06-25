import type { LucideIcon } from "lucide-react"

export function PanelEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="mt-14 flex flex-col items-center gap-3 px-6 text-center">
      <div className="surface-2 flex h-11 w-11 items-center justify-center rounded-xl border">
        <Icon className="h-5 w-5 text-muted-foreground/70" />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-foreground/80">{title}</p>
        <p className="text-pretty text-[12px] leading-relaxed text-muted-foreground/65">{description}</p>
      </div>
    </div>
  )
}
