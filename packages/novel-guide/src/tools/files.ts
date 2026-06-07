import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./tool.js";
import { normalizeSlashPath, relativeTo, resolveInside } from "../utils/paths.js";

function stringInput(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export const ReadFileTool: Tool = {
  name: "read_file",
  description: "Read a UTF-8 text file from the workspace.",
  readonly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative file path." },
      offset: { type: "number", description: "Optional 1-based line offset." },
      limit: { type: "number", description: "Optional maximum number of lines." },
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
      content: `File: ${normalizeSlashPath(rel)}\nLines: ${offset}-${offset + selected.length - 1} of ${lines.length}\n\n${selected.join("\n")}`,
      metadata: { path: rel, totalLines: lines.length },
    };
  },
};

export const WriteFileTool: Tool = {
  name: "write_file",
  description: "Write a UTF-8 text file. Creates parent directories.",
  readonly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative file path." },
      content: { type: "string", description: "Complete file content." },
    },
    required: ["path", "content"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const rel = stringInput(input.path);
    const content = stringInput(input.content);
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
      content: `Wrote ${relativeTo(context.cwd, abs)} (${content.length} chars).`,
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
  description: "Edit a UTF-8 text file by replacing exact text.",
  readonly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_text: { type: "string", description: "Exact text to replace." },
      new_text: { type: "string", description: "Replacement text." },
      replace_all: { type: "boolean", description: "Replace all occurrences instead of one." },
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
    if (!oldText) return { ok: false, content: "old_text must not be empty." };

    const abs = resolveInside(context.cwd, rel);
    const workspacePath = relativeTo(context.cwd, abs);
    const raw = await readFile(abs, "utf8");
    const occurrences = raw.split(oldText).length - 1;
    if (occurrences === 0) return { ok: false, content: `No exact match found in ${rel}.` };
    if (occurrences > 1 && !replaceAll) {
      return { ok: false, content: `Found ${occurrences} matches in ${rel}; set replace_all=true or provide a more specific old_text.` };
    }
    const next = replaceAll ? raw.split(oldText).join(newText) : raw.replace(oldText, newText);
    await writeFile(abs, next, "utf8");
    return {
      ok: true,
      content: `Edited ${relativeTo(context.cwd, abs)}; replaced ${replaceAll ? occurrences : 1} occurrence(s).`,
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
  description: "Create a reviewable file-change proposal without modifying the target file. Use in proposal workflows such as /续写 and /改稿.",
  readonly: false,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace-relative target file path." },
      after_content: { type: "string", description: "Complete proposed file content after the change." },
      summary: { type: "string", description: "Short proposal summary." },
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
    const summary = stringInput(input.summary) || `Proposed change to ${rel}`;
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
      content: `Proposed ${workspacePath}; ${beforeContent.length} -> ${afterContent.length} chars. No file was modified.`,
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
