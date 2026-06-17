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
  packageRelativeDir: string;
  promptRelativePath: string;
  readmeRelativePath: string;
  manifestRelativePath: string;
  missingRelativePath: string;
  filesRelativeDir: string;
  bundleRelativeDir: string;
  zipRelativePath?: string;
  content: string;
  readmeContent: string;
  manifestContent: string;
  messageCount: number;
  estimatedTokens: number;
  mode: HandoffMode;
  profile: HandoffTargetProfile;
  chapter: string;
  target: string;
  copy: boolean;
  bundle: boolean;
  zip: boolean;
  inline: boolean;
  referencedFiles: string[];
  filesToBundle: string[];
  referencedParentDirs: string[];
}

export interface ParsedEjectArgs {
  chapter: string;
  target: string;
  profile: HandoffTargetProfile;
  mode: HandoffMode;
  copy: boolean;
  bundle: boolean;
  zip: boolean;
  inline: boolean;
}

const MAX_MESSAGE_CHARS = 900;
const MAX_RECENT_MESSAGES = 18;
const MAX_SECTION_CHARS = 12000;
const CORE_PACKAGE_FILES = ["NOVEL.md", "GUIDE.md"];

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
  let bundle = true;
  let zip = true;
  let inline = false;

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
    if (token === "--bundle" || token === "--copy-files") {
      bundle = true;
      inline = false;
      continue;
    }
    if (token === "--no-bundle") {
      bundle = false;
      zip = false;
      continue;
    }
    if (token === "--zip") {
      zip = true;
      continue;
    }
    if (token === "--no-zip") {
      zip = false;
      continue;
    }
    if (token === "--inline") {
      inline = true;
      bundle = false;
      zip = false;
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

  if (!bundle) zip = false;
  return { chapter, target, profile, mode, copy, bundle, zip, inline };
}

export function renderEjectHandoff(input: EjectHandoffInput): EjectHandoffResult {
  const parsed = parseEjectArgs(input.args);
  const baseName = `${parsed.chapter}-${parsed.target}`;
  const packageRelativeDir = path.posix.join("handoff", baseName);
  const filesRelativeDir = path.posix.join(packageRelativeDir, "files");
  const promptRelativePath = parsed.bundle
    ? path.posix.join(packageRelativeDir, "prompt.md")
    : path.posix.join("handoff", `${baseName}.md`);
  const readmeRelativePath = path.posix.join(packageRelativeDir, "README.md");
  const manifestRelativePath = path.posix.join(packageRelativeDir, "manifest.json");
  const missingRelativePath = `${manifestRelativePath}.missing`;
  const zipRelativePath = parsed.bundle && parsed.zip ? path.posix.join("handoff", `${baseName}.zip`) : undefined;
  const recentMessages = input.messages.slice(-MAX_RECENT_MESSAGES);
  const userMessages = recentMessages.filter((message) => message.role === "user");
  const assistantMessages = recentMessages.filter((message) => message.role === "assistant");
  const referencedFiles = extractFileRefs(recentMessages);
  const filesToBundle = collectFilesToBundle(referencedFiles);
  const referencedParentDirs = collectParentDirs(filesToBundle);
  const nowIso = input.nowIso ?? new Date().toISOString();

  const recentUserIntent = truncateSection(userMessages
    .map((message) => `- ${truncateInline(stringifyMessageContent(message.content), MAX_MESSAGE_CHARS)}`)
    .join("\n") || "- （当前会话里没有可导出的用户消息。）");

  const assistantNotes = truncateSection(assistantMessages
    .map((message) => `- ${truncateInline(stringifyMessageContent(message.content), MAX_MESSAGE_CHARS)}`)
    .join("\n") || "- （当前会话里没有可导出的助手结论。）");

  const referencedFilesMarkdown = referencedFiles.length
    ? referencedFiles.map((file) => `- ${file}`).join("\n")
    : "- （未从最近会话中识别到明确文件路径。）";
  const filesToBundleMarkdown = filesToBundle.map((file) => `- ${file}`).join("\n");
  const parentDirsMarkdown = referencedParentDirs.length
    ? referencedParentDirs.map((dir) => `- ${dir}/`).join("\n")
    : "- （无额外父级目录提示。）";

  const basePrompt = buildNextPrompt(parsed, filesToBundle);
  const profileSections = buildProfileSections(parsed, basePrompt, filesToBundleMarkdown);
  const modeLine = parsed.mode === "polish"
    ? "deterministic extract plus explicit light polish; polish must not add facts."
    : "active REPL session snapshot, deterministic extract; no model call during /eject.";
  const packageLine = parsed.bundle
    ? `upload package directory: ${packageRelativeDir}`
    : parsed.inline
      ? "inline markdown export; no copied file package"
      : "single handoff markdown; no copied file package";

  const content = [
    `# Handoff: ${parsed.chapter} ${parsed.target}`,
    "",
    `- Generated: ${nowIso}`,
    `- Session: ${input.sessionId}`,
    `- Workspace: ${input.cwd}`,
    `- Profile: ${parsed.profile}`,
    `- Mode: ${parsed.mode}`,
    `- Export: ${packageLine}`,
    `- Prompt file: ${promptRelativePath}`,
    `- File bundle: ${parsed.bundle ? filesRelativeDir : "disabled"}`,
    `- Zip: ${zipRelativePath ?? "disabled"}`,
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
    "## Files included in the upload package",
    "",
    filesToBundleMarkdown,
    "",
    "## Files referenced in recent turns",
    "",
    referencedFilesMarkdown,
    "",
    "## Parent directory hints",
    "",
    parentDirsMarkdown,
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
    parsed.bundle
      ? `- Upload ${zipRelativePath ?? packageRelativeDir}; if zip upload is unavailable, upload ${packageRelativeDir}/.`
      : "- This inline export does not copy files. Use /handoff for a cold, file-grounded 6-card prompt or run /eject without --inline for an upload package.",
    "- Do not treat this file as canon; use it as a bridge into the next session or external model.",
    "- If any section looks incomplete, ask the author for the smallest missing fact instead of inventing plot.",
    "- After saving a new chapter locally, run /chapter-delta <draft-path> to extract state changes for author review.",
    "",
  ].join("\n");

  const readmeContent = buildReadmeContent({
    baseName,
    promptRelativePath,
    zipRelativePath,
    filesToBundle,
    filesRelativeDir,
    profile: parsed.profile,
  });
  const manifestContent = buildManifestContent({
    nowIso,
    sessionId: input.sessionId,
    workspace: input.cwd,
    parsed,
    promptRelativePath,
    filesRelativeDir,
    filesToBundle,
    referencedFiles,
    referencedParentDirs,
  });

  return {
    relativePath: promptRelativePath,
    packageRelativeDir,
    promptRelativePath,
    readmeRelativePath,
    manifestRelativePath,
    missingRelativePath,
    filesRelativeDir,
    bundleRelativeDir: filesRelativeDir,
    zipRelativePath,
    content,
    readmeContent,
    manifestContent,
    messageCount: input.messages.length,
    estimatedTokens: estimateTextTokens(content),
    mode: parsed.mode,
    profile: parsed.profile,
    chapter: parsed.chapter,
    target: parsed.target,
    copy: parsed.copy,
    bundle: parsed.bundle,
    zip: parsed.zip,
    inline: parsed.inline,
    referencedFiles,
    filesToBundle,
    referencedParentDirs,
  };
}

function buildNextPrompt(parsed: ParsedEjectArgs, filesToBundle: string[]): string {
  const fileHint = filesToBundle.length
    ? `上传包内包含这些工作区文件：${filesToBundle.map((file) => `files/${file}`).join("、")}。请先读取 prompt.md，再按需读取这些文件。`
    : "先读取 prompt.md；若信息不足，向作者索要 NOVEL.md、GUIDE.md 或相关 canon/drafts 文件。";
  return [
    "你正在接手一个 Novel Guide 小说工作区。",
    fileHint,
    `目标范围：${parsed.chapter} / ${parsed.target}。目标 profile：${parsed.profile}。`,
    "请基于文件事实继续，不要凭空补设定；如果缺少 canon、上一章章尾或本章大纲，先列缺失项和最小追问。",
  ].join("\n");
}

function buildProfileSections(parsed: ParsedEjectArgs, nextPrompt: string, uploadFiles: string): string[] {
  switch (parsed.profile) {
    case "long-context":
      return [
        "## Long-context package",
        "",
        "<handoff>",
        `  <target>${parsed.chapter} / ${parsed.target}</target>`,
        "  <rules>Read prompt.md first, then read uploaded workspace files. Keep canon authoritative. Ask minimal questions when facts are missing.</rules>",
        "  <files>",
        indent(uploadFiles, "    "),
        "  </files>",
        "</handoff>",
      ];
    case "chatgpt":
      return [
        "## ChatGPT setup",
        "",
        "### System instructions",
        "你是小说项目接力助手。必须以上传的工作区文件为准，不编造正典，不代写未请求的正文。",
        "",
        "### Knowledge files to upload/read",
        uploadFiles,
        "",
        "### Starter prompt",
        nextPrompt,
      ];
    case "gemini":
    case "notebooklm":
      return [
        "## Grounded long-context workflow",
        "",
        "1. 上传 zip；若不支持 zip，就上传 package 目录中的 prompt.md 和 files/。",
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
        "- 写法：中文网文语感，节奏直接；但所有设定必须以上传文件为准。",
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

function buildReadmeContent(input: {
  baseName: string;
  promptRelativePath: string;
  zipRelativePath?: string;
  filesToBundle: string[];
  filesRelativeDir: string;
  profile: HandoffTargetProfile;
}): string {
  const localPromptPath = input.promptRelativePath.split("/").slice(-1)[0] ?? "prompt.md";
  const localFilesDir = input.filesRelativeDir.split("/").slice(-1)[0] ?? "files";
  return [
    `# ${input.baseName} upload package`,
    "",
    "## How to use",
    "",
    input.zipRelativePath
      ? `1. 首选上传 \`${input.zipRelativePath}\` 给外部模型。`
      : "1. 上传本目录中的文件给外部模型。",
    `2. 如果模型不支持 zip，就上传本目录里的 \`${localPromptPath}\`、\`manifest.json\` 和 \`${localFilesDir}/\`。`,
    `3. 让模型先读取 \`${localPromptPath}\`，再按需读取 \`${localFilesDir}/\` 内文件。`,
    "4. 保存新章到本地后，运行 `/chapter-delta <draft-path>` 抽取状态变化；作者确认后再写 canon。",
    "",
    "## Included workspace files",
    "",
    input.filesToBundle.map((file) => `- ${localFilesDir}/${file}`).join("\n"),
    "",
    "## Notes",
    "",
    `- Target profile: ${input.profile}`,
    "- `manifest.json.missing` 出现时，表示有文件未复制成功；不要让外部模型凭空补这些内容。",
    "- `/eject` 是热会话接力包；如果需要纯粘贴、内联 6 张卡的写作提示词，请用 `/handoff`。",
    "",
  ].join("\n");
}

function buildManifestContent(input: {
  nowIso: string;
  sessionId: string;
  workspace: string;
  parsed: ParsedEjectArgs;
  promptRelativePath: string;
  filesRelativeDir: string;
  filesToBundle: string[];
  referencedFiles: string[];
  referencedParentDirs: string[];
}): string {
  const filesDirName = input.filesRelativeDir.split("/").slice(-1)[0] ?? "files";
  return `${JSON.stringify({
    schema: "novel-guide.eject-package.v1",
    generated: input.nowIso,
    sessionId: input.sessionId,
    workspace: input.workspace,
    chapter: input.parsed.chapter,
    target: input.parsed.target,
    profile: input.parsed.profile,
    mode: input.parsed.mode,
    prompt: input.promptRelativePath,
    filesDir: input.filesRelativeDir,
    expectedFiles: input.filesToBundle.map((file) => ({
      source: file,
      bundledPath: `${filesDirName}/${file}`,
    })),
    referencedFiles: input.referencedFiles,
    referencedParentDirs: input.referencedParentDirs,
    notes: [
      "Read prompt.md first.",
      "Workspace files remain authoritative.",
      "Missing files, if any, are listed in manifest.json.missing.",
    ],
  }, null, 2)}\n`;
}

function collectFilesToBundle(referencedFiles: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const file of [...CORE_PACKAGE_FILES, ...referencedFiles]) {
    const normalized = normalizeWorkspaceRef(file);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function collectParentDirs(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    const dir = path.posix.dirname(file);
    if (dir && dir !== ".") dirs.add(dir);
  }
  return [...dirs].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function normalizeWorkspaceRef(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-zA-Z]:/.test(normalized)) return null;
  return normalized;
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
      const ref = normalizeWorkspaceRef(match[1]);
      if (!ref) continue;
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
