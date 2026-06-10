import type { WorkbenchFile, WorkbenchGroup } from "@/lib/types"

export function findFirstWorkbenchFile(groups: WorkbenchGroup[]): string {
  for (const group of groups) {
    if (group.files.length > 0) return group.files[0].path
  }
  return ""
}

export function findWorkbenchFile(groups: WorkbenchGroup[], path: string): WorkbenchFile | null {
  for (const group of groups) {
    for (const file of group.files) {
      if (file.path === path) return file
    }
  }
  return null
}

export function filterWorkbenchTree(tree: WorkbenchGroup[], query: string): WorkbenchGroup[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return tree
  return tree
    .map((group) => {
      if (group.label.toLowerCase().includes(normalizedQuery)) return group
      return {
        ...group,
        files: group.files.filter((file) => `${file.name} ${file.path}`.toLowerCase().includes(normalizedQuery)),
      }
    })
    .filter((group) => group.files.length > 0)
}

export function countWorkbenchFiles(groups: WorkbenchGroup[]): number {
  return groups.reduce((sum, group) => sum + group.files.length, 0)
}

export function formatWorkbenchTimestamp(updatedAt: string): string {
  return new Date(updatedAt).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
