"use client"

export function AppBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0">
      <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[var(--light-warm)] opacity-60 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-[var(--light-cool)] opacity-40 blur-3xl dark:opacity-25" />
    </div>
  )
}
