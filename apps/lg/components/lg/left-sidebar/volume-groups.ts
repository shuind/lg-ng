import type { Chapter, OutlineFile } from "@/lib/types"

export const UNASSIGNED_VOLUME_KEY = "__unassigned__"

export type SidebarVolume = {
  key: string
  title: string
  path?: string
  aliases: string[]
}

export type SidebarVolumeGroup<T> = {
  key: string
  title: string
  path?: string
  items: T[]
}

export type ChapterNavEntry = {
  key: string
  title: string
  shortLabel?: string
  chapter?: Chapter
  outline?: OutlineFile
}

function normalize(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, "")
    .replace(/[《》「」『』【】()[\]（）·\-_:：、.．]/g, "")
    .toLowerCase()
}

function pathSegments(filePath: string): string[] {
  return filePath.replace(/\\/g, "/").split("/").filter(Boolean)
}

function fileBase(filePath: string): string {
  const segments = pathSegments(filePath)
  return (segments[segments.length - 1] ?? filePath).replace(/\.md$/i, "")
}

function volumeOrdinal(value: string): string | null {
  return value.match(/第\s*[一二三四五六七八九十百千万〇零两\d]+\s*卷/)?.[0]?.replace(/\s+/g, "") ?? null
}

function chapterOrdinal(value: string): string | null {
  return value.match(/第\s*[一二三四五六七八九十百千万〇零两\d]+\s*章/)?.[0]?.replace(/\s+/g, "") ?? null
}

function chapterNumberLabel(value: string): string | null {
  return value.match(/第\s*([一二三四五六七八九十百千万〇零两\d]+)\s*章/)?.[1] ?? null
}

function volumeDirectory(filePath: string): string | null {
  const segments = pathSegments(filePath)
  if (segments.length < 3) return null
  const root = segments[0]
  if (root !== "章节大纲" && root !== "章纲" && root !== "章节正文") return null
  return segments[1] ?? null
}

function aliasesForVolume(outline: OutlineFile): string[] {
  const candidates = [
    outline.title,
    fileBase(outline.path),
    volumeOrdinal(outline.title),
    volumeOrdinal(fileBase(outline.path)),
  ].filter((item): item is string => Boolean(item))
  return [...new Set(candidates.map(normalize).filter(Boolean))]
}

function toVolume(outline: OutlineFile): SidebarVolume {
  return {
    key: `volume:${outline.path}`,
    title: outline.title,
    path: outline.path,
    aliases: aliasesForVolume(outline),
  }
}

function createSyntheticVolume(title: string): SidebarVolume {
  return {
    key: `synthetic:${normalize(title)}`,
    title,
    aliases: [normalize(title), volumeOrdinal(title)].filter((item): item is string => Boolean(item)).map(normalize),
  }
}

function findVolumeByText(volumes: SidebarVolume[], text: string): SidebarVolume | null {
  const normalizedText = normalize(text)
  if (!normalizedText) return null
  return volumes.find((volume) => volume.aliases.some((alias) => alias && normalizedText.includes(alias))) ?? null
}

function ensureGroup<T>(groups: Map<string, SidebarVolumeGroup<T>>, volume: SidebarVolume): SidebarVolumeGroup<T> {
  let group = groups.get(volume.key)
  if (!group) {
    group = { key: volume.key, title: volume.title, path: volume.path, items: [] }
    groups.set(volume.key, group)
  }
  return group
}

function groupForItem<T extends { title: string; path: string }>(
  item: T,
  volumes: SidebarVolume[],
  groups: Map<string, SidebarVolumeGroup<T>>,
): SidebarVolumeGroup<T> {
  return ensureGroup(groups, volumeForItem(item, volumes))
}

function volumeForItem<T extends { title: string; path: string }>(
  item: T,
  volumes: SidebarVolume[],
): SidebarVolume {
  const directory = volumeDirectory(item.path)
  if (directory) {
    const existing = findVolumeByText(volumes, directory)
    if (existing) return existing
    const synthetic = createSyntheticVolume(directory)
    volumes.push(synthetic)
    return synthetic
  }

  const byTitle = findVolumeByText(volumes, `${item.title} ${fileBase(item.path)}`)
  if (byTitle) return byTitle

  if (volumes.length === 1) return volumes[0]
  return {
    key: UNASSIGNED_VOLUME_KEY,
    title: "未分卷",
    aliases: [],
  }
}

function orderedGroups<T>(groups: Map<string, SidebarVolumeGroup<T>>, volumes: SidebarVolume[]): SidebarVolumeGroup<T>[] {
  const ordered = volumes.flatMap((volume) => {
    const group = groups.get(volume.key)
    return group ? [group] : []
  })
  const synthetic = [...groups.values()]
    .filter((group) => group.key.startsWith("synthetic:") && !ordered.some((item) => item.key === group.key))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN", { numeric: true }))
  const unassigned = groups.get(UNASSIGNED_VOLUME_KEY)
  return [...ordered, ...synthetic, ...(unassigned ? [unassigned] : [])]
}

export function groupOutlinesByVolume(outlines: OutlineFile[]): SidebarVolumeGroup<OutlineFile>[] {
  const volumeOutlines = outlines.filter((outline) => outline.level === "volume")
  const chapterOutlines = outlines.filter((outline) => outline.level === "chapter")
  const volumes = volumeOutlines.map(toVolume)
  const groups = new Map<string, SidebarVolumeGroup<OutlineFile>>()

  for (const volume of volumes) ensureGroup(groups, volume)
  for (const outline of chapterOutlines) {
    groupForItem(outline, volumes, groups).items.push(outline)
  }

  return orderedGroups(groups, volumes)
}

export function groupChaptersByVolume(chapters: Chapter[], outlines: OutlineFile[]): SidebarVolumeGroup<Chapter>[] {
  const volumes = outlines.filter((outline) => outline.level === "volume").map(toVolume)
  const groups = new Map<string, SidebarVolumeGroup<Chapter>>()

  for (const volume of volumes) ensureGroup(groups, volume)
  for (const chapter of chapters) {
    groupForItem(chapter, volumes, groups).items.push(chapter)
  }

  return orderedGroups(groups, volumes)
}

function chapterEntryKey(item: { title: string; path: string }): string {
  return chapterOrdinal(item.title) ?? chapterOrdinal(fileBase(item.path)) ?? normalize(`${item.title} ${fileBase(item.path)}`)
}

function displayChapterEntryTitle(chapter?: Chapter, outline?: OutlineFile): string {
  return chapter?.title ?? outline?.title ?? "未命名章节"
}

function stripChapterPrefix(value: string): string {
  return value
    .replace(/^第\s*[一二三四五六七八九十百千万〇零两\d]+\s*章\s*[·\-_:：、.．\s]*/, "")
    .trim() || value
}

function shortChapterLabel(item: { title: string; path: string }): string | undefined {
  return chapterNumberLabel(item.title) ?? chapterNumberLabel(fileBase(item.path)) ?? undefined
}

export function groupChapterNavByVolume(
  chapters: Chapter[],
  outlines: OutlineFile[],
): SidebarVolumeGroup<ChapterNavEntry>[] {
  const chapterOutlines = outlines.filter((outline) => outline.level === "chapter")
  const volumeOutlines = outlines.filter((outline) => outline.level === "volume")
  const volumes = volumeOutlines.map(toVolume)
  const groups = new Map<string, SidebarVolumeGroup<ChapterNavEntry>>()

  for (const volume of volumes) ensureGroup(groups, volume)

  const entriesByGroup = new Map<string, Map<string, ChapterNavEntry>>()

  function upsertEntry(item: Chapter | OutlineFile, kind: "chapter" | "outline") {
    const group = ensureGroup(groups, volumeForItem(item, volumes))
    let entries = entriesByGroup.get(group.key)
    if (!entries) {
      entries = new Map()
      entriesByGroup.set(group.key, entries)
    }

    const entryKey = chapterEntryKey(item)
    const existing = entries.get(entryKey)
    if (existing) {
      if (kind === "chapter") existing.chapter = item as Chapter
      else existing.outline = item as OutlineFile
      existing.title = stripChapterPrefix(displayChapterEntryTitle(existing.chapter, existing.outline))
      existing.shortLabel = existing.shortLabel ?? shortChapterLabel(item)
      return
    }

    const rawTitle = displayChapterEntryTitle(kind === "chapter" ? item as Chapter : undefined, kind === "outline" ? item as OutlineFile : undefined)
    const entry: ChapterNavEntry = {
      key: entryKey,
      title: stripChapterPrefix(rawTitle),
      shortLabel: shortChapterLabel(item),
      chapter: kind === "chapter" ? item as Chapter : undefined,
      outline: kind === "outline" ? item as OutlineFile : undefined,
    }
    entries.set(entryKey, entry)
    group.items.push(entry)
  }

  for (const chapter of chapters) upsertEntry(chapter, "chapter")
  for (const outline of chapterOutlines) upsertEntry(outline, "outline")

  return orderedGroups(groups, volumes)
}
