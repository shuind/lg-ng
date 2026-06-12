import { getConfig, callChatCompletion } from "@/lib/server/llm"
import { getChapter } from "@/lib/server/chapter-store"
import { readStyleGuideSummary } from "@/lib/server/skill-service"

const SYSTEM_PROMPT = `你是 LG 的写作试写助手。你只负责基于当前章节上下文生成一段临时试写文本。
这段文本不会自动写入正文，用户确认后才会保留。

请遵循：
- 延续当前章节的叙事视角、语气和节奏
- 参考创作指南摘要
- 不要解释你的写作思路
- 不要输出标题、列表或 Markdown
- 不要重复已有段落
- 只输出可直接接在正文后的小说文本`

const FALLBACK_TEXT = "（试写）夜色沉沉，远处隐约传来更鼓声。笔墨尚温，故事未完。"

function truncateEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(-maxChars)
}

export async function generateDraftForChapter(input: {
  bookId: string
  chapterId: string
  prompt?: string
}): Promise<string> {
  const config = getConfig()
  if (!config) return FALLBACK_TEXT

  try {
    const [chapter, summary] = await Promise.all([
      getChapter(input.bookId, input.chapterId),
      readStyleGuideSummary(input.bookId).catch(() => ""),
    ])

    if (!chapter) return FALLBACK_TEXT

    const context = truncateEnd(chapter.content, 1000)
    const summaryBlock = summary.trim() ? `\n\n创作指南摘要：\n${summary.slice(0, 500)}` : ""
    const promptBlock = input.prompt?.trim() ? `\n\n用户的额外要求：${input.prompt.trim()}` : ""

    const userContent = `当前章节正文（末尾部分）：
${context}${summaryBlock}${promptBlock}

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
