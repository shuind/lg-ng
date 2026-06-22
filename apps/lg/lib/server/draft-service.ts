import { getConfig, callChatCompletion } from "@/lib/server/llm"
import { getChapter } from "@/lib/server/chapter-store"
import { listIndexedFiles, listIndexedSettingCards, type IndexedBookFile } from "@/lib/server/book-index"
import { readBookFile } from "@/lib/server/book-store"
import { resolveSkillSummaries } from "@/lib/server/skill-service"
import type { SettingCard, SkillSummary } from "@/lib/types"

const SYSTEM_PROMPT = `你是 LG 的写作试写助手。你只负责基于当前章节上下文生成一段临时试写文本。
这段文本不会自动写入正文，用户确认后才会保留。

请遵循：
- 延续当前章节的叙事视角、语气和节奏
- 用户额外要求只约束本次试写目标，不能覆盖项目事实、系统规则或已给正文
- 如果本次启用了写作 Skill，必须把它当作正文生成规则执行
- 不要解释你的写作思路
- 不要输出标题、列表或 Markdown
- 不要重复已有段落
- 只输出可直接接在正文后的小说文本`

const FALLBACK_TEXT = "（试写）夜色沉沉，远处隐约传来更鼓声。笔墨尚温，故事未完。"
const DRAFT_SUPPORT_FILE_LIMIT = 8
const DRAFT_SUPPORT_CARD_LIMIT = 10
const DRAFT_SUPPORT_EXCERPT_CHARS = 700
const DRAFT_SKILL_LIMIT = 6
const DRAFT_SKILL_EXCERPT_CHARS = 1200
const DRAFT_CONTEXT_ROOT_PRIORITY = [
  "NOVEL.md",
  "GUIDE.md",
  "写作约束",
  "章节大纲",
  "卷纲",
  "剧情管理",
  "读者体验",
  "人物设定",
  "世界观",
  "canon",
]
const DRAFT_CONTEXT_CARD_CATEGORY_PRIORITY: SettingCard["category"][] = [
  "character",
  "event",
  "rule",
  "location",
  "faction",
  "mechanism",
  "formation",
  "other",
]

function truncateEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(-maxChars)
}

function clipText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+\n/g, "\n").trim()
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars).trim()}...` : normalized
}

function rootOf(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").filter(Boolean)[0] ?? filePath
}

function rootPriority(filePath: string): number {
  const normalized = filePath.replace(/\\/g, "/")
  const direct = DRAFT_CONTEXT_ROOT_PRIORITY.indexOf(normalized)
  if (direct >= 0) return direct
  const root = rootOf(normalized)
  const rootIndex = DRAFT_CONTEXT_ROOT_PRIORITY.indexOf(root)
  return rootIndex >= 0 ? rootIndex : DRAFT_CONTEXT_ROOT_PRIORITY.length + 10
}

function compareDraftSupportFiles(a: IndexedBookFile, b: IndexedBookFile): number {
  const priorityDiff = rootPriority(a.path) - rootPriority(b.path)
  if (priorityDiff !== 0) return priorityDiff
  return a.path.localeCompare(b.path, "zh-CN", { numeric: true })
}

function scoreSettingCard(card: SettingCard, queryText: string): number {
  const haystack = queryText.toLowerCase()
  let score = 0
  if (card.name && haystack.includes(card.name.toLowerCase())) score += 10
  for (const alias of card.aliases ?? []) {
    if (alias && haystack.includes(alias.toLowerCase())) score += 6
  }
  const categoryIndex = DRAFT_CONTEXT_CARD_CATEGORY_PRIORITY.indexOf(card.category)
  score += Math.max(0, DRAFT_CONTEXT_CARD_CATEGORY_PRIORITY.length - categoryIndex)
  return score
}

function normalizeSkillIds(skillIds: string[] | undefined): string[] {
  return [...new Set((skillIds ?? []).filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
    .slice(0, DRAFT_SKILL_LIMIT)
}

function formatDraftWritingSkills(summaries: SkillSummary[]): string {
  const writingSkills = summaries.filter((item) => item.skill.kind === "writing")
  if (writingSkills.length === 0) return ""
  return writingSkills
    .map((item) => {
      const name = item.skill.name || item.skill.id
      return `## ${name}\n${clipText(item.summary, DRAFT_SKILL_EXCERPT_CHARS)}`
    })
    .join("\n\n")
}

function formatSettingCards(cards: SettingCard[], queryText: string): string {
  const lines = [...cards]
    .sort((a, b) => scoreSettingCard(b, queryText) - scoreSettingCard(a, queryText) || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, DRAFT_SUPPORT_CARD_LIMIT)
    .map((card) => [
      `- ${card.name}`,
      card.category,
      clipText(card.summary || "", 160),
      card.path ? `path=${card.path}` : "",
    ].filter(Boolean).join(" | "))
  return lines.length > 0 ? `相关设定摘要：\n${lines.join("\n")}` : ""
}

async function buildDraftSupportContext(input: {
  bookId: string
  chapterPath: string
  queryText: string
}): Promise<string> {
  const [cards, files] = await Promise.all([
    listIndexedSettingCards(input.bookId).catch(() => []),
    listIndexedFiles(input.bookId).catch(() => []),
  ])
  const cardBlock = formatSettingCards(cards, input.queryText)
  const supportFiles = files
    .filter((file) => file.extension === ".md")
    .filter((file) => file.path !== input.chapterPath)
    .filter((file) => rootPriority(file.path) < DRAFT_CONTEXT_ROOT_PRIORITY.length)
    .sort(compareDraftSupportFiles)
    .slice(0, DRAFT_SUPPORT_FILE_LIMIT)

  const fileBlocks = await Promise.all(supportFiles.map(async (file) => {
    const content = await readBookFile(input.bookId, file.path)
    if (!content?.trim()) return ""
    return `## ${file.path}\n${clipText(content, DRAFT_SUPPORT_EXCERPT_CHARS)}`
  }))
  return [
    cardBlock,
    fileBlocks.filter(Boolean).length > 0
      ? `参考文件摘录（摘要，不是完整事实；需要以当前章节正文为直接承接）：\n${fileBlocks.filter(Boolean).join("\n\n")}`
      : "",
  ].filter(Boolean).join("\n\n")
}

export async function generateDraftForChapter(input: {
  bookId: string
  chapterId: string
  prompt?: string
  skillIds?: string[]
}): Promise<string> {
  const config = getConfig()
  if (!config) return FALLBACK_TEXT

  try {
    const chapter = await getChapter(input.bookId, input.chapterId)

    if (!chapter) return FALLBACK_TEXT

    const context = truncateEnd(chapter.content, 1000)
    const queryText = `${chapter.title}\n${context}\n${input.prompt ?? ""}`
    const skillIds = normalizeSkillIds(input.skillIds)
    const writingSkillBlock = skillIds.length > 0
      ? formatDraftWritingSkills(await resolveSkillSummaries(input.bookId, skillIds).catch(() => []))
      : ""
    const supportContext = await buildDraftSupportContext({
      bookId: input.bookId,
      chapterPath: chapter.path,
      queryText,
    }).catch(() => "")
    const supportBlock = supportContext.trim() ? `\n\n项目约束与参考：\n${supportContext}` : ""
    const skillBlock = writingSkillBlock.trim() ? `\n\n本次启用的写作 Skill：\n${writingSkillBlock}` : ""
    const promptBlock = input.prompt?.trim()
      ? `\n\n用户额外要求（只约束本次试写，不覆盖项目事实或当前正文）：\n${input.prompt.trim()}`
      : ""

    const userContent = `当前章节正文（末尾部分）：
${context}${supportBlock}${skillBlock}${promptBlock}

请续写 300-600 字，直接接在正文后面。`

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: userContent },
    ]

    const result = await callChatCompletion(config, messages, {
      temperature: 0.7,
      maxTokens: 1500,
      feature: "draft",
    })

    return result.content.trim() || FALLBACK_TEXT
  } catch (err) {
    console.warn("[draft-service] LLM call failed:", err)
    return FALLBACK_TEXT
  }
}
