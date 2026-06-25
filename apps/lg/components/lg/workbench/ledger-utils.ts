import type { LedgerEntry } from "@/lib/types"

export { canDirectRollback } from "@/lib/ledger-entry-utils"

export function formatLedgerTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "时间未知"
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function formatLedgerSummary(
  entry: Pick<LedgerEntry, "action" | "summary" | "targetPath">,
): string | null {
  const targetPath = entry.targetPath.trim()
  let summary = entry.summary.trim()

  if (targetPath) {
    const pathVariants = [
      targetPath,
      targetPath.replace(/\\/g, "/"),
      targetPath.replace(/\//g, "\\"),
    ]

    for (const variant of unique(pathVariants)) {
      summary = replaceAllText(summary, variant, "")
    }
  }

  summary = compactSummary(summary)
  if (!summary || isGenericLedgerSummary(summary)) return null
  return summary
}

function compactSummary(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s:：,，.。;；、-]+/, "")
    .replace(/[\s:：,，.。;；、-]+$/, "")
    .trim()
}

function isGenericLedgerSummary(summary: string): boolean {
  return (
    summary === "导入材料" ||
    summary === "手动保存" ||
    /^rollback to before\b/i.test(summary)
  )
}

function replaceAllText(value: string, search: string, replacement: string): string {
  if (!search) return value
  return value.split(search).join(replacement)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => right.length - left.length)
}
