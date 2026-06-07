import type { RecentChangeFile } from "./recent-change-types"

export function formatChangeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "未知"

  const diff = Date.now() - date.getTime()
  if (diff >= 0 && diff < 7 * 86400000) {
    return formatRelativeTime(iso)
  }

  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function formatFilePreview(files: RecentChangeFile[]): string {
  if (files.length === 0) return "未指定文件"
  if (files.length === 1) return files[0].path
  return `${files
    .slice(0, 2)
    .map((file) => file.name)
    .join("、")}${files.length > 2 ? ` 等 ${files.length} 个文件` : ""}`
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return "未知"
  const diff = Date.now() - time
  if (diff < 0) return "刚刚"
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const date = new Date(iso)
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`
}
