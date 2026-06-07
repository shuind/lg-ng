"use client"

export function TemporaryConstraintInput({
  value,
  onValueChange,
  onAdd,
}: {
  value: string
  onValueChange: (value: string) => void
  onAdd: () => void
}) {
  return (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onAdd()
          }
        }}
        placeholder="本轮临时约束"
        className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={!value.trim()}
        className="rounded-md bg-foreground px-2.5 py-1 text-[11px] text-background transition hover:opacity-90 disabled:opacity-40"
      >
        添加
      </button>
    </div>
  )
}
