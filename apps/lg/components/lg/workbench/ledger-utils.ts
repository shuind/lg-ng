export { canDirectRollback } from "@/lib/ledger-entry-utils"

export function formatLedgerTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
