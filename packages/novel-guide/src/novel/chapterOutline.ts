export type ChapterOutlineSplitChapter = {
  title: string;
  fileName: string;
  content: string;
};

export type ChapterOutlineSplitResult = {
  volume?: {
    title: string;
    fileName: string;
    content: string;
  };
  chapters: ChapterOutlineSplitChapter[];
};

const CHAPTER_OUTLINE_ROOTS = new Set(["章节大纲", "章纲"]);
const CHAPTER_HEADING_RE = /^(#{1,6})\s*第\s*([一二三四五六七八九十百千万〇零两\d]+)\s*章\s*[：:、.．·\-\s]*(.*?)\s*$/gmu;

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function pathRoot(value: string): string {
  return normalizePath(value).split("/").filter(Boolean)[0] ?? "";
}

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80) || "未命名";
}

function chapterTitle(numberLabel: string, rawTitle: string): string {
  const title = rawTitle.trim();
  return title ? `第${numberLabel}章 · ${title}` : `第${numberLabel}章`;
}

function normalizeVolumeTitle(rawTitle: string, fallbackName: string): string {
  const cleaned = rawTitle
    .replace(/^#+\s*/, "")
    .replace(/章节大纲/g, "")
    .replace(/大纲/g, "")
    .replace(/[《「『](.+?)[》」』]/g, " · $1")
    .replace(/\s*[-—:：]\s*/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*/g, " · ")
    .trim()
    .replace(/ · $/, "");
  return cleaned || fallbackName.replace(/\.md$/i, "");
}

function firstHeadingTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function replaceFirstLineWithHeading(content: string, title: string): string {
  const lines = content.trim().split(/\r?\n/);
  lines[0] = `# ${title}`;
  return `${lines.join("\n").trim()}\n`;
}

function chapterHeadingMatches(content: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  CHAPTER_HEADING_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHAPTER_HEADING_RE.exec(content)) !== null) {
    matches.push(match);
  }
  return matches;
}

export function isChapterOutlinePath(filePath: string): boolean {
  return CHAPTER_OUTLINE_ROOTS.has(pathRoot(filePath)) && normalizePath(filePath).toLowerCase().endsWith(".md");
}

export function countChapterOutlineHeadings(content: string): number {
  return chapterHeadingMatches(content).length;
}

export function validateChapterOutlineFile(filePath: string, content: string): { ok: true } | { ok: false; message: string } {
  if (!isChapterOutlinePath(filePath)) return { ok: true };
  const chapterCount = countChapterOutlineHeadings(content);
  if (chapterCount <= 1) return { ok: true };
  return {
    ok: false,
    message: `多章章纲不能写入单个章节大纲文件（检测到 ${chapterCount} 个章节标题）。请拆分为 \`章节大纲/第N章 · 标题.md\`；卷级总览写入 \`卷纲/\`。`,
  };
}

export function splitChapterOutlineDocument(content: string, sourceName = "章节大纲"): ChapterOutlineSplitResult {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const matches = chapterHeadingMatches(normalizedContent);
  const chapters: ChapterOutlineSplitChapter[] = [];
  if (matches.length === 0) return { chapters };

  const preface = normalizedContent.slice(0, matches[0].index).trim();
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const next = matches[index + 1];
    const rawChunk = normalizedContent.slice(match.index, next?.index ?? normalizedContent.length).trim();
    const title = chapterTitle(match[2], match[3] ?? "");
    chapters.push({
      title,
      fileName: `${sanitizeFilePart(title)}.md`,
      content: replaceFirstLineWithHeading(rawChunk, title),
    });
  }

  const result: ChapterOutlineSplitResult = { chapters };
  if (preface) {
    const title = normalizeVolumeTitle(firstHeadingTitle(preface) ?? sourceName, sourceName);
    result.volume = {
      title,
      fileName: `${sanitizeFilePart(title)}.md`,
      content: replaceFirstLineWithHeading(preface, title),
    };
  }
  return result;
}
