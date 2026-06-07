"use client"

export function ThreadMenuActionButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  )
}
