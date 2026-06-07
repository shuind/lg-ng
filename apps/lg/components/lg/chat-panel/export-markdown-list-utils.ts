export function appendListSection(lines: string[], label: string, items?: string[]) {
  if (!items || items.length === 0) return
  lines.push(`- ${label}:`)
  for (const item of items) {
    lines.push(`  - ${item}`)
  }
}

export function appendNestedList(lines: string[], label: string, items?: string[]) {
  if (!items || items.length === 0) return
  lines.push(`  - ${label}:`)
  for (const item of items) {
    lines.push(`    - ${item}`)
  }
}

export function indentBlock(text: string, prefix: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join("\n")
}
