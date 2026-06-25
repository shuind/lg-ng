"use client"

import type { ReactNode } from "react"
import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"

type DiffVariant = "unified" | "split"

export function DiffBlock({
  title,
  subtitle,
  patch,
  emptyMessage = "没有可预览的 diff。",
  action,
  className,
  maxHeightClass = "max-h-80",
  variant = "unified",
}: {
  title?: string
  subtitle?: string
  patch?: string
  emptyMessage?: string
  action?: ReactNode
  className?: string
  maxHeightClass?: string
  variant?: DiffVariant
}) {
  const lines = patch ? displayDiffLines(patch) : []
  const stat = patch ? countDiffStat(lines) : null

  return (
    <section className={cn("surface-1 overflow-hidden rounded-lg border text-[12px]", className)}>
      {(title || subtitle || action) && (
        <div className="flex min-w-0 items-center gap-3 border-b hairline px-3 py-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            {title && <div className="truncate font-mono text-[11px] text-foreground/85">{title}</div>}
            {subtitle && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</div>}
          </div>
          {stat && (stat.additions > 0 || stat.deletions > 0) && (
            <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10.5px]">
              {stat.additions > 0 && <span className="text-emerald-700 dark:text-emerald-300">+{stat.additions}</span>}
              {stat.deletions > 0 && <span className="text-red-700 dark:text-red-300">-{stat.deletions}</span>}
            </div>
          )}
          {action}
        </div>
      )}
      {patch && variant === "split" ? (
        <SplitDiff lines={lines} maxHeightClass={maxHeightClass} />
      ) : patch ? (
        <pre className={cn("overflow-auto bg-background/55 py-2 font-mono text-[10.5px] leading-[1.65]", maxHeightClass)}>
          {lines.map((line, index) => (
            <div key={`${index}-${line.slice(0, 12)}`} className={cn("min-w-max px-3", lineClass(line))}>
              {line || " "}
            </div>
          ))}
        </pre>
      ) : (
        <div className="px-3 py-3 text-[11px] text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </section>
  )
}

type SplitDiffRow =
  | { kind: "hunk"; text: string }
  | { kind: "context" | "changed" | "removed" | "added"; oldText: string; newText: string }

function SplitDiff({ lines, maxHeightClass }: { lines: string[]; maxHeightClass: string }) {
  const rows = splitDiffRows(lines)

  return (
    <div className={cn("overflow-auto bg-background/55 font-mono text-[10.5px] leading-[1.65]", maxHeightClass)}>
      <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-border/60 bg-background/95 text-[10px] font-medium text-muted-foreground backdrop-blur">
        <div className="border-r border-border/60 px-3 py-1.5">原文</div>
        <div className="px-3 py-1.5">新版</div>
      </div>
      <div className="min-w-0">
        {rows.map((row, index) => {
          if (row.kind === "hunk") {
            return (
              <div key={`${index}-${row.text}`} className="border-b border-border/35 bg-accent/12 px-3 py-1 text-accent-foreground">
                {row.text}
              </div>
            )
          }

          return (
            <div key={index} className="grid min-w-0 grid-cols-2 border-b border-border/25">
              <SplitCell side="old" row={row} />
              <SplitCell side="new" row={row} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SplitCell({
  row,
  side,
}: {
  row: Exclude<SplitDiffRow, { kind: "hunk" }>
  side: "old" | "new"
}) {
  const text = side === "old" ? row.oldText : row.newText
  const sign = side === "old" ? "-" : "+"
  const active = (side === "old" && (row.kind === "changed" || row.kind === "removed")) ||
    (side === "new" && (row.kind === "changed" || row.kind === "added"))

  return (
    <div className={cn(
      "min-w-0 whitespace-pre-wrap break-words px-3 py-1",
      side === "old" && "border-r border-border/45",
      cellClass(row.kind, side),
    )}>
      {active ? <span className="mr-1 select-none opacity-60">{sign}</span> : <span className="mr-1 select-none opacity-0">+</span>}
      {text || " "}
    </div>
  )
}

function cellClass(kind: Exclude<SplitDiffRow, { kind: "hunk" }>["kind"], side: "old" | "new"): string {
  if (kind === "changed") {
    return side === "old"
      ? "bg-red-500/12 text-red-800 dark:text-red-200"
      : "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
  }
  if (kind === "removed") {
    return side === "old"
      ? "bg-red-500/12 text-red-800 dark:text-red-200"
      : "bg-muted/20 text-muted-foreground/50"
  }
  if (kind === "added") {
    return side === "new"
      ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
      : "bg-muted/20 text-muted-foreground/50"
  }
  return "text-foreground/82"
}

function splitDiffRows(lines: string[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = []
  let pendingRemoved: string[] = []

  function flushRemoved() {
    for (const oldText of pendingRemoved) {
      rows.push({ kind: "removed", oldText, newText: "" })
    }
    pendingRemoved = []
  }

  for (const line of lines) {
    if (line.startsWith("@@")) {
      flushRemoved()
      rows.push({ kind: "hunk", text: line })
      continue
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      pendingRemoved.push(line.slice(1))
      continue
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (pendingRemoved.length > 0) {
        rows.push({ kind: "changed", oldText: pendingRemoved.shift() ?? "", newText: line.slice(1) })
      } else {
        rows.push({ kind: "added", oldText: "", newText: line.slice(1) })
      }
      continue
    }

    flushRemoved()
    rows.push({ kind: "context", oldText: stripContextPrefix(line), newText: stripContextPrefix(line) })
  }

  flushRemoved()
  return rows
}

function stripContextPrefix(line: string): string {
  return line.startsWith(" ") ? line.slice(1) : line
}

function lineClass(line: string): string {
  if (line.startsWith("@@")) return "bg-accent/15 text-accent-foreground"
  if (line.startsWith("+") && !line.startsWith("+++")) return "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
  if (line.startsWith("-") && !line.startsWith("---")) return "bg-red-500/12 text-red-800 dark:text-red-200"
  if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
    return "text-muted-foreground"
  }
  return "text-foreground/82"
}

function countDiffStat(lines: string[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1
    else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1
  }
  return { additions, deletions }
}

function displayDiffLines(patch: string): string[] {
  return patch
    .split(/\r?\n/)
    .filter((line) => !isPatchFileHeaderLine(line))
}

function isPatchFileHeaderLine(line: string): boolean {
  return (
    line.startsWith("Index: ") ||
    /^={3,}$/.test(line) ||
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  )
}
