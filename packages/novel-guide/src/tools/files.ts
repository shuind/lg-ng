import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./tool.js";
import { FILE_WRITE_TOOL_HINT } from "../prompts/novelRules.js";
import { validateChapterOutlineFile } from "../novel/chapterOutline.js";
import { normalizeSlashPath, relativeTo, resolveInside } from "../utils/paths.js";

function stringInput(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export const ReadFileTool: Tool = {
  name: "read_file",
  description: "读取工作区内 UTF-8 文本文件。",
  readonly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "工作区相对路径。" },
      offset: { type: "number", description: "可选，1 起始行号。" },
      limit: { type: "number", description: "可选，最多读取行数。" },
    },
    required: ["path"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const rel = stringInput(input.path);
    const abs = resolveInside(context.cwd, rel);
    const raw = await readFile(abs, "utf8");
    const lines = raw.split(/\r?\n/);
    const offset = typeof input.offset === "number" && input.offset > 0 ? Math.floor(input.offset) : 1;
    const limit = typeof input.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : lines.length;
    const selected = lines.slice(offset - 1, offset - 1 + limit);
    return {
      ok: true,
      content: `文件：${normalizeSlashPath(rel)}\n行：${offset}-${offset + selected.length - 1}/${lines.length}\n\n${selected.join("\n")}`,
      metadata: { path: rel, totalLines: lines.length },
    };
  },
};

export const WriteFileTool: Tool = {
  name: "write_file",
  description: `写 UTF-8 文本文件并创建父目录。${FILE_WRITE_TOOL_HINT}`,
  readonly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "工作区相对路径。" },
      content: { type: "string", description: "完整文件内容。" },
    },
    required: ["path", "content"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const rel = stringInput(input.path);
    const content = stringInput(input.content);
    const outlineValidation = validateChapterOutlineFile(rel, content);
    if (!outlineValidation.ok) return { ok: false, content: outlineValidation.message };
    const abs = resolveInside(context.cwd, rel);
    const workspacePath = relativeTo(context.cwd, abs);
    let beforeContent: string | null = null;
    let beforeExists = false;
    try {
      beforeContent = await readFile(abs, "utf8");
      beforeExists = true;
    } catch {
      beforeContent = null;
    }
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return {
      ok: true,
      content: `已写入 ${relativeTo(context.cwd, abs)}（${content.length} 字符）。`,
      metadata: {
        fileChanges: [{
          path: workspacePath,
          operation: "write",
          beforeExists,
          charCount: content.length,
          beforeContent,
          afterContent: content,
        }],
      },
    };
  },
};

export const EditFileTool: Tool = {
  name: "edit_file",
  description: `精确替换文本来编辑 UTF-8 文件。${FILE_WRITE_TOOL_HINT}`,
  readonly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_text: { type: "string", description: "要替换的精确文本。" },
      new_text: { type: "string", description: "替换文本。" },
      replace_all: { type: "boolean", description: "替换全部匹配，否则只替换一处。" },
    },
    required: ["path", "old_text", "new_text"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const rel = stringInput(input.path);
    const oldText = stringInput(input.old_text);
    const newText = stringInput(input.new_text);
    const replaceAll = input.replace_all === true;
    if (!oldText) return { ok: false, content: "old_text 不能为空。" };

    const abs = resolveInside(context.cwd, rel);
    const workspacePath = relativeTo(context.cwd, abs);
    const raw = await readFile(abs, "utf8");
    const occurrences = raw.split(oldText).length - 1;
    if (occurrences === 0) return { ok: false, content: `${rel} 未找到精确匹配。` };
    if (occurrences > 1 && !replaceAll) {
      return { ok: false, content: `${rel} 有 ${occurrences} 处匹配；请设 replace_all=true 或提供更具体 old_text。` };
    }
    const next = replaceAll ? raw.split(oldText).join(newText) : raw.replace(oldText, newText);
    const outlineValidation = validateChapterOutlineFile(rel, next);
    if (!outlineValidation.ok) return { ok: false, content: outlineValidation.message };
    await writeFile(abs, next, "utf8");
    return {
      ok: true,
      content: `已编辑 ${relativeTo(context.cwd, abs)}；替换 ${replaceAll ? occurrences : 1} 处。`,
      metadata: {
        fileChanges: [{
          path: workspacePath,
          operation: "edit",
          beforeExists: true,
          charCount: next.length,
          beforeContent: raw,
          afterContent: next,
        }],
      },
    };
  },
};

export const ProposeFileChangeTool: Tool = {
  name: "propose_file_change",
  description: `创建可审阅文件变更提案，不改目标文件。用于 /续写、/改稿。${FILE_WRITE_TOOL_HINT}`,
  readonly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "目标文件工作区相对路径。" },
      after_content: { type: "string", description: "变更后的完整提案内容。" },
      summary: { type: "string", description: "简短提案摘要。" },
      source: { type: "string", enum: ["chat", "draft", "workflow"] },
    },
    required: ["path", "after_content"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const rel = stringInput(input.path);
    const afterContent = stringInput(input.after_content);
    const outlineValidation = validateChapterOutlineFile(rel, afterContent);
    if (!outlineValidation.ok) return { ok: false, content: outlineValidation.message };
    const summary = stringInput(input.summary) || `${rel} 的改动提案`;
    const source = input.source === "draft" || input.source === "workflow" ? input.source : "chat";
    const abs = resolveInside(context.cwd, rel);
    const workspacePath = relativeTo(context.cwd, abs);
    let beforeContent = "";
    let beforeExists = false;
    try {
      beforeContent = await readFile(abs, "utf8");
      beforeExists = true;
    } catch {
      beforeContent = "";
    }
    return {
      ok: true,
      content: `已生成提案 ${workspacePath}；${beforeContent.length} -> ${afterContent.length} 字符。未修改文件。`,
      metadata: {
        proposals: [{
          path: workspacePath,
          beforeExists,
          beforeContent,
          afterContent,
          summary,
          source,
        }],
      },
    };
  },
};

export function allFileTools(): Tool[] {
  return [ReadFileTool, WriteFileTool, EditFileTool, ProposeFileChangeTool];
}
