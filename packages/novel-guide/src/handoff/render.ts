import path from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface EjectHandoffInput {
  cwd: string;
  sessionId: string;
  messages: ChatCompletionMessageParam[];
  args: string;
  nowIso?: string;
}

export interface EjectHandoffResult {
  relativePath: string;
  content: string;
  messageCount: number;
}

interface ParsedEjectArgs {
  chapter: string;
  target: string;
}

const MAX_MESSAGE_CHARS = 900;
const MAX_RECENT_MESSAGES = 18;
const MAX_SECTION_CHARS = 12000;

const FILE_PATH_PATTERN = /(?:^|[\s`"'（(])((?:NOVEL|GUIDE)\.md|(?:canon|candidates|drafts|handoff|archive|inbox)\/[\w\-.\/一-鿿]+\.[\w]+|\.novel-guide\/[\w\-.\/]+)(?=$|[\s`"'，。；;：:）)])/g;

export function parseEjectArgs(args: string): ParsedEjectArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let chapter = "ch00";
  let target = "session";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ((token === "--chapter" || token === "-c") && tokens[index + 1]) {
      chapter = normalizeChapter(tokens[index + 1]);
      index += 1;
      continue;
    }
    if ((token === "--target" || token === "--for") && tokens[index + 1]) {
      target = sanitizeSlug(tokens[index + 1]) || target;
      index += 1;
      continue;
    }

    const chapterMatch = token.match(/^(?:ch(?:apter)?|第)?(\d{1,4})(?:章)?(?:[-_](.+))?$/i);
    if (chapterMatch) {
      chapter = normalizeChapter(chapterMatch[1]);
      if (chapterMatch[2]) target = sanitizeSlug(chapterMatch[2]) || target;
      continue;
    }

    const embeddedChapter = token.match(/(?:ch(?:apter)?|第)(\d{1,4})/i);
    if (embeddedChapter) {
      chapter = normalizeChapter(embeddedChapter[1]);
      const withoutChapter = token.replace(embeddedChapter[0], "").replace(/^[-_]+|[-_]+$/g, "");
      if (withoutChapter) target = sanitizeSlug(withoutChapter) || target;
      continue;
    }

    if (!token.startsWith("--") && target === "session") {
      target = sanitizeSlug(token) || target;
    }
  }

  return { chapter, target };
}

export function renderEjectHandoff(input: EjectHandoffInput): EjectHandoffResult {
  const parsed = parseEjectArgs(input.args);
  const relativePath = path.posix.join("handoff", `${parsed.chapter}-${parsed.target}.md`);
  const recentMessages = input.messages.slice(-MAX_RECENT_MESSAGES);
  const userMessages = recentMessages.filter((message) => message.role === "user");
  const assistantMessages = recentMessages.filter((message) => message.role === "assistant");
  const fileRefs = extractFileRefs(recentMessages);
  const nowIso = input.nowIso ?? new Date().toISOString();

  const recentUserIntent = truncateSection(userMessages
    .map((message) => `- ${truncateInline(stringifyMessageContent(message.content), MAX_MESSAGE_CHARS)}`)
    .join("\n") || "- （当前会话里没有可导出的用户消息。）");

  const assistantNotes = truncateSection(assistantMessages
    .map((message) => `- ${truncateInline(stringifyMessageContent(message.content), MAX_MESSAGE_CHARS)}`)
    .join("\n") || "- （当前会话里没有可导出的助手结论。）");

  const referencedFiles = fileRefs.length
    ? fileRefs.map((file) => `- ${file}`).join("\n")
    : "- （未从最近会话中识别到明确文件路径；下一步先读 NOVEL.md 和 GUIDE.md。）";

  const nextPrompt = [
    "你正在接手一个 Novel Guide 小说工作区。请先读取 NOVEL.md 和 GUIDE.md，再按需读取上方列出的相关文件。",
    `目标范围：${parsed.chapter} / ${parsed.target}。`,
    "请基于文件事实继续，不要凭空补设定；如果缺少 canon、上一章章尾或本章大纲，先列缺失项和最小追问。",
  ].join("\n");

  const content = [
    `# Handoff: ${parsed.chapter} ${parsed.target}`,
    "",
    `- Generated: ${nowIso}`,
    `- Session: ${input.sessionId}`,
    `- Workspace: ${input.cwd}`,
    `- Source: active REPL session snapshot, deterministic extract; no model call during /eject.`,
    "",
    "## Current user intent from recent turns",
    "",
    recentUserIntent,
    "",
    "## Assistant conclusions / recent state",
    "",
    assistantNotes,
    "",
    "## Files referenced in recent turns",
    "",
    referencedFiles,
    "",
    "## Suggested next prompt",
    "",
    "```text",
    nextPrompt,
    "```",
    "",
    "## Notes",
    "",
    "- This handoff is extracted from the active session. Workspace files remain authoritative.",
    "- Do not treat this file as canon; use it as a bridge into the next session or external model.",
    "- If any section looks incomplete, ask the author for the smallest missing fact instead of inventing plot.",
    "",
  ].join("\n");

  return { relativePath, content, messageCount: input.messages.length };
}

function normalizeChapter(value: string): string {
  const match = value.match(/\d{1,4}/);
  if (!match) return "ch00";
  return `ch${match[0].padStart(2, "0")}`;
}

function sanitizeSlug(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/\.\.+/g, "-")
    .replace(/[^a-z0-9一-鿿_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 48);
  return ascii || "session";
}

function extractFileRefs(messages: ChatCompletionMessageParam[]): string[] {
  const seen = new Set<string>();
  for (const message of messages) {
    const text = stringifyMessageContent(message.content);
    for (const match of text.matchAll(FILE_PATH_PATTERN)) {
      const ref = match[1].replace(/\\/g, "/").replace(/^\/+/, "");
      if (ref.includes("..")) continue;
      seen.add(ref);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function truncateSection(value: string): string {
  if (value.length <= MAX_SECTION_CHARS) return value;
  return `${value.slice(0, MAX_SECTION_CHARS).trimEnd()}\n- ……（已截断，避免把完整会话或正文塞入 handoff。）`;
}

function truncateInline(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}…（截断）`;
}

function stringifyMessageContent(content: ChatCompletionMessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
      return "";
    }).filter(Boolean).join("\n");
  }
  return "";
}
