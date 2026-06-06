import type { Message } from "@/lib/types"

export interface OutlineContentValidation {
  ok: boolean
  reason?: string
  score: number
  chapterMarkers: number
}

export interface OutlineSourceCandidate {
  content: string
  message: Message
  score: number
  validation: OutlineContentValidation
}

const OUTLINE_KEYWORDS = [
  "大纲",
  "卷纲",
  "章纲",
  "核心冲突",
  "核心矛盾",
  "主角目标",
  "阶段目标",
  "章节功能",
  "行动线",
  "悬念",
  "转折",
  "结局",
  "反派",
  "压力",
  "信息释放",
  "爽点",
  "情绪",
]

const SAVE_COMMAND_SIGNALS = [
  "保存",
  "保存下来",
  "保存为",
  "记录",
  "记下来",
  "写入",
  "录入",
  "存一下",
  "正式大纲",
  "正式大纲文件",
]

const REFERENCE_SIGNALS = [
  "这套",
  "这个",
  "这份",
  "上面",
  "前面",
  "刚才",
  "上一版",
  "当前",
]

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function containsAny(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(signal))
}

export function containsInternalActionJson(text: string): boolean {
  return /"type"\s*:\s*"(outline_update|world_update|character_update|chapter_summary_update|book_mutation_propose|agent_rule_update)"/.test(text) ||
    /"(toolCalls|actions|requiresConfirmation)"\s*:/.test(text)
}

export function referencesPreviousOutline(text: string): boolean {
  return containsAny(text, REFERENCE_SIGNALS) ||
    (text.includes("正式大纲") && containsAny(text, SAVE_COMMAND_SIGNALS))
}

export function isOutlineMutationRequest(text: string): boolean {
  return containsAny(text, SAVE_COMMAND_SIGNALS) && containsAny(text, ["大纲", "卷纲", "章纲"])
}

export function isOutlineScopePath(scopePath: string | undefined): boolean {
  return Boolean(scopePath?.startsWith("卷纲/") || scopePath?.startsWith("章节大纲/"))
}

export function looksLikeCommandOnlyOutlineText(text: string): boolean {
  const compact = normalizeSpaces(text)
  if (!compact) return true
  const hasSaveCommand = containsAny(compact, SAVE_COMMAND_SIGNALS)
  const hasReference = containsAny(compact, REFERENCE_SIGNALS)
  const hasOutline = containsAny(compact, ["大纲", "卷纲", "章纲"])
  const hasStructure = countMatches(text, /第\s*[一二三四五六七八九十百零〇0-9]+\s*[章节卷]/g) > 0 ||
    countMatches(text, /^#{1,4}\s+/gm) > 0 ||
    countMatches(text, /^\s*[-*]\s+/gm) >= 3

  if (compact.length <= 80 && hasSaveCommand && hasOutline) return true
  if (compact.length <= 120 && hasReference && hasOutline && !hasStructure) return true
  if (/^(把|将)?(这套|这个|这份|上面|前面|刚才|当前|上一版)?.{0,12}(大纲|卷纲|章纲).{0,16}(保存|记录|写入|录入|正式|文件)/.test(compact) && !hasStructure) {
    return true
  }
  return false
}

export function validatePersistableOutlineContent(
  content: string | undefined,
  outlineLevel: "volume" | "chapter" = "volume",
): OutlineContentValidation {
  const text = content?.trim() ?? ""
  const compact = normalizeSpaces(text)
  const chapterMarkers = countMatches(text, /第\s*[一二三四五六七八九十百零〇0-9]+\s*[章节]/g)
  const volumeMarkers = countMatches(text, /第\s*[一二三四五六七八九十百零〇0-9]+\s*卷/g)
  const headingCount = countMatches(text, /^#{1,4}\s+\S+/gm)
  const bulletCount = countMatches(text, /^\s*[-*]\s+\S+/gm)
  const numberedLines = countMatches(text, /^\s*\d+[.、]\s*\S+/gm)
  const keywordHits = OUTLINE_KEYWORDS.filter((keyword) => text.includes(keyword)).length
  const structuralLines = headingCount + bulletCount + numberedLines
  const score =
    chapterMarkers * 4 +
    volumeMarkers * 3 +
    headingCount * 2 +
    Math.min(bulletCount + numberedLines, 8) +
    keywordHits +
    Math.min(Math.floor(text.length / 120), 6)

  if (!text) {
    return { ok: false, reason: "大纲正文为空。", score, chapterMarkers }
  }
  if (containsInternalActionJson(text)) {
    return { ok: false, reason: "内容包含内部 action JSON，不能写入大纲文件。", score, chapterMarkers }
  }
  if (looksLikeCommandOnlyOutlineText(text)) {
    return { ok: false, reason: "内容看起来是保存命令，不是大纲正文。", score, chapterMarkers }
  }

  const minLength = outlineLevel === "chapter" ? 80 : 120
  if (compact.length < minLength) {
    return { ok: false, reason: `大纲正文过短，至少需要 ${minLength} 个字符并包含结构信息。`, score, chapterMarkers }
  }

  const hasVolumeStructure = outlineLevel === "volume" &&
    (chapterMarkers >= 2 || (structuralLines >= 4 && keywordHits >= 3) || (volumeMarkers >= 1 && keywordHits >= 4))
  const hasChapterStructure = outlineLevel === "chapter" &&
    (chapterMarkers >= 1 || (structuralLines >= 3 && keywordHits >= 2) || keywordHits >= 5)
  const hasGenericOutlineStructure = structuralLines >= 5 && keywordHits >= 2

  if (!(hasVolumeStructure || hasChapterStructure || hasGenericOutlineStructure)) {
    return { ok: false, reason: "大纲正文缺少章节/阶段/目标/冲突等可识别结构。", score, chapterMarkers }
  }

  return { ok: true, score, chapterMarkers }
}

function stripLeadingSaveCommand(text: string): string {
  return text
    .replace(/^\s*(把|将)?\s*(下面|以下|这套|这个|这份|上面|前面|刚才|当前|上一版)?\s*(第一卷|第[一二三四五六七八九十百零〇0-9]+卷|第一章|第[一二三四五六七八九十百零〇0-9]+章)?\s*(大纲|卷纲|章纲)?\s*(保存下来|保存为正式大纲文件|保存为正式大纲|保存|记录|记下来|写入|录入|存一下|更新)?\s*[:：]?\s*/u, "")
    .trim()
}

function fencedBlocks(text: string): string[] {
  const blocks: string[] = []
  const re = /```(?:markdown|md|text|json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (match[1]?.trim()) blocks.push(match[1].trim())
  }
  return blocks
}

function inlineOutlineCandidates(userMessage: string): string[] {
  const candidates = new Set<string>()
  for (const block of fencedBlocks(userMessage)) candidates.add(block)

  const firstNewline = userMessage.indexOf("\n")
  if (firstNewline >= 0) {
    candidates.add(userMessage.slice(firstNewline + 1).trim())
  }

  const colonMatch = userMessage.match(/[:：]\s*([\s\S]+)$/)
  if (colonMatch?.[1]?.trim()) candidates.add(colonMatch[1].trim())

  candidates.add(stripLeadingSaveCommand(userMessage))
  return [...candidates].filter(Boolean)
}

export function extractInlineOutlineContent(
  userMessage: string,
  outlineLevel: "volume" | "chapter",
): string | undefined {
  return inlineOutlineCandidates(userMessage)
    .map((content) => ({
      content,
      validation: validatePersistableOutlineContent(content, outlineLevel),
    }))
    .filter((item) => item.validation.ok)
    .sort((a, b) => b.validation.score - a.validation.score || b.content.length - a.content.length)[0]?.content
}

export function findReferencedOutlineSource(input: {
  messages: Message[]
  currentUserMessage: string
  currentTurnId?: string
  outlineLevel: "volume" | "chapter"
  limit?: number
}): OutlineSourceCandidate | undefined {
  const recent = input.messages.slice(-(input.limit ?? 24))
  const candidates: OutlineSourceCandidate[] = []

  for (let recency = 0; recency < recent.length; recency++) {
    const message = recent[recent.length - 1 - recency]
    if (!message || message.role === "system") continue
    if (input.currentTurnId && message.turnId === input.currentTurnId) continue
    if (message.role === "user" && message.content.trim() === input.currentUserMessage.trim()) continue

    const candidateTexts = message.role === "user"
      ? [message.content, stripLeadingSaveCommand(message.content), ...fencedBlocks(message.content)]
      : [message.content, ...fencedBlocks(message.content)]

    for (const candidateText of candidateTexts) {
      const content = candidateText.trim()
      if (!content || content.length < 80) continue
      if (containsInternalActionJson(content)) continue

      const validation = validatePersistableOutlineContent(content, input.outlineLevel)
      if (!validation.ok) continue
      const sourceScore = validation.score + Math.min(content.length / 150, 8) - recency * 0.35
      candidates.push({ content, message, score: sourceScore, validation })
    }
  }

  return candidates.sort((a, b) => b.score - a.score)[0]
}
