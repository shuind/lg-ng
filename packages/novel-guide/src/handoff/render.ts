import path from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { estimateTextTokens } from "../agent/tokenEstimate.js";

export type HandoffMode = "extract" | "polish";
export type HandoffTargetProfile =
  | "session"
  | "deepseek"
  | "kimi"
  | "doubao"
  | "qwen"
  | "long-context"
  | "chatgpt"
  | "gemini"
  | "notebooklm";

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
  estimatedTokens: number;
  mode: HandoffMode;
  profile: HandoffTargetProfile;
  chapter: string;
  target: string;
  copy: boolean;
}

export interface ParsedEjectArgs {
  chapter: string;
  target: string;
  profile: HandoffTargetProfile;
  mode: HandoffMode;
  copy: boolean;
}

const MAX_MESSAGE_CHARS = 900;
const MAX_RECENT_MESSAGES = 18;
const MAX_SECTION_CHARS = 12000;

const FILE_PATH_PATTERN = /(?:^|[\s`"'（(])((?:NOVEL|GUIDE)\.md|(?:canon|candidates|drafts|handoff|archive|inbox)\/[\w\-.\/一-鿿]+\.[\w]+|\.novel-guide\/[\w\-.\/]+)(?=$|[\s`"'，。；;：:）)])/g;
const PROFILE_ALIASES: Record<string, HandoffTargetProfile> = {
  session: "session",
  deepseek: "deepseek",
  kimi: "kimi",
  doubao: "doubao",
  "豆包": "doubao",
  qwen: "qwen",
  tongyi: "qwen",
  "通义": "qwen",
  "long-context": "long-context",
  longcontext: "long-context",
  long: "long-context",
  chatgpt: "chatgpt",
  gpt: "chatgpt",
  gemini: "gemini",
  notebooklm: "notebooklm",
  notebook: "notebooklm",
};

export function parseEjectArgs(args: string): ParsedEjectArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let chapter = "ch00";
  let target = "session";
  let profile: HandoffTargetProfile = "session";
  let mode: HandoffMode = "extract";
  let copy = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ((token === "--chapter" || token === "-c") && tokens[index + 1]) {
      chapter = normalizeChapter(tokens[index + 1]);
      index += 1;
      continue;
    }
    if ((token === "--target" || token === "--for") && tokens[index + 1]) {
      const rawTarget = tokens[index + 1];
      target = sanitizeSlug(rawTarget) || target;
      profile = normalizeProfile(rawTarget) ?? profile;
      index += 1;
      continue;
    }
    if (token === "--polish") {
      mode = "polish";
      continue;
    }
    if (token === "--copy") {
      copy = true;
      continue;
    }
    if (token === "--no-copy") {
      copy = false;
      continue;
    }

    const chapterMatch = token.match(/^(?:ch(?:apter)?|第)?(\d{1,4})(?:章)?(?:[-_](.+))?$/i);
    if (chapterMatch) {
      chapter = normalizeChapter(chapterMatch[1]);
      if (chapterMatch[2]) {
        target = sanitizeSlug(chapterMatch[2]) || target;
        profile = normalizeProfile(chapterMatch[2]) ?? profile;
      }
      continue;
    }

    const embeddedChapter = token.match(/(?:ch(?:apter)?|第)(\d{1,4})/i);
    if (embeddedChapter) {
      chapter = normalizeChapter(embeddedChapter[1]);
      const withoutChapter = token.replace(embeddedChapter[0], "").replace(/^[-_]+|[-_]+$/g, "");
      if (withoutChapter) {
        target = sanitizeSlug(withoutChapter) || target;
        profile = normalizeProfile(withoutChapter) ?? profile;
      }
      continue;
    }

    if (!token.startsWith("--") && target === "session") {
      target = sanitizeSlug(token) || target;
      profile = normalizeProfile(token) ?? profile;
    }
  }

  return { chapter, target, profile, mode, copy };
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

  const basePrompt = buildNextPrompt(parsed, fileRefs);
  const profileSections = buildProfileSections(parsed, basePrompt, referencedFiles);
  const modeLine = parsed.mode === "polish"
    ? "deterministic extract plus explicit light polish; polish must not add facts."
    : "active REPL session snapshot, deterministic extract; no model call during /eject.";

  const content = [
    `# Handoff: ${parsed.chapter} ${parsed.target}`,
    "",
    `- Generated: ${nowIso}`,
    `- Session: ${input.sessionId}`,
    `- Workspace: ${input.cwd}`,
    `- Profile: ${parsed.profile}`,
    `- Mode: ${parsed.mode}`,
    `- Source: ${modeLine}`,
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
    ...profileSections,
    "",
    "## Suggested next prompt",
    "",
    "```text",
    basePrompt,
    "```",
    "",
    "## Notes",
    "",
    "- This handoff is extracted from the active session. Workspace files remain authoritative.",
    "- Do not treat this file as canon; use it as a bridge into the next session or external model.",
    "- If any section looks incomplete, ask the author for the smallest missing fact instead of inventing plot.",
    "- Avoid adding new facts, plot, setting, or chapter prose unless the author explicitly asks.",
    "",
  ].join("\n");

  return {
    relativePath,
    content,
    messageCount: input.messages.length,
    estimatedTokens: estimateTextTokens(content),
    mode: parsed.mode,
    profile: parsed.profile,
    chapter: parsed.chapter,
    target: parsed.target,
    copy: parsed.copy,
  };
}

function buildNextPrompt(parsed: ParsedEjectArgs, fileRefs: string[]): string {
  const fileHint = fileRefs.length
    ? `优先读取这些相关文件：${fileRefs.join("、")}。`
    : "先读取 NOVEL.md 和 GUIDE.md，再按需检索 canon/、candidates/、drafts/、handoff/。";
  return [
    "你正在接手一个 Novel Guide 小说工作区。",
    fileHint,
    `目标范围：${parsed.chapter} / ${parsed.target}。目标 profile：${parsed.profile}。`,
    "请基于文件事实继续，不要凭空补设定；如果缺少 canon、上一章章尾或本章大纲，先列缺失项和最小追问。",
  ].join("\n");
}

function buildProfileSections(parsed: ParsedEjectArgs, nextPrompt: string, referencedFiles: string): string[] {
  switch (parsed.profile) {
    case "long-context":
      return [
        "## Long-context package",
        "",
        "<handoff>",
        `  <target>${parsed.chapter} / ${parsed.target}</target>`,
        "  <rules>Read workspace files first. Keep canon authoritative. Ask minimal questions when facts are missing.</rules>",
        "  <files>",
        indent(referencedFiles, "    "),
        "  </files>",
        "</handoff>",
      ];
    case "chatgpt":
      return [
        "## ChatGPT setup",
        "",
        "### System instructions",
        "你是小说项目接力助手。必须以工作区文件为准，不编造正典，不代写未请求的正文。",
        "",
        "### Knowledge files to upload/read",
        referencedFiles,
        "",
        "### Starter prompt",
        nextPrompt,
      ];
    case "gemini":
    case "notebooklm":
      return [
        "## Grounded long-context workflow",
        "",
        "1. 上传或读取 NOVEL.md、GUIDE.md 和相关 canon 包。",
        "2. 先做来源化摘要，列出每条判断来自哪个文件。",
        "3. 再处理本次章节目标；信息不足时只提最小问题。",
      ];
    case "deepseek":
    case "kimi":
    case "doubao":
    case "qwen":
      return [
        "## 中文网页模型任务卡",
        "",
        `- 目标：围绕 ${parsed.chapter} / ${parsed.target} 接力推进。`,
        "- 写法：中文网文语感，节奏直接；但所有设定必须以文件为准。",
        "- 禁止：补不存在的设定、提前揭示伏笔、把交接内容当正典。",
      ];
    case "session":
    default:
      return [
        "## Session handoff focus",
        "",
        "- 用最近会话意图承接下一步。",
        "- 进入新会话后仍以工作区文件为准。",
      ];
  }
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

function normalizeProfile(value: string): HandoffTargetProfile | null {
  return PROFILE_ALIASES[sanitizeSlug(value)] ?? PROFILE_ALIASES[value.trim().toLowerCase()] ?? null;
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

function indent(value: string, prefix: string): string {
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
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
