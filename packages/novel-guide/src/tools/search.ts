import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { Tool } from "./tool.js";
import { normalizeSlashPath } from "../utils/paths.js";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const GlobTool: Tool = {
  name: "glob",
  description: "List files matching a glob pattern relative to the workspace.",
  readonly: true,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern, e.g. canon/**/*.md" },
      limit: { type: "number" },
    },
    required: ["pattern"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const limit = typeof input.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : 200;
    const entries = await fg(str(input.pattern), {
      cwd: context.cwd,
      onlyFiles: true,
      dot: true,
      ignore: ["node_modules/**", ".git/**", "dist/**"],
    });
    const shown = entries.slice(0, limit).map(normalizeSlashPath);
    return { ok: true, content: shown.length ? shown.join("\n") : "No files matched.", metadata: { total: entries.length } };
  },
};

export const GrepTool: Tool = {
  name: "grep",
  description: "Search text in workspace files with a regular expression.",
  readonly: true,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "JavaScript regular expression." },
      include: { type: "string", description: "Glob include pattern, default **/*.{md,txt,json,ts,tsx,js}" },
      limit: { type: "number" },
    },
    required: ["pattern"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const pattern = str(input.pattern);
    const include = str(input.include) || "**/*.{md,txt,json,ts,tsx,js}";
    const limit = typeof input.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : 100;
    const regex = new RegExp(pattern, "i");
    const files = await fg(include, {
      cwd: context.cwd,
      onlyFiles: true,
      dot: true,
      ignore: ["node_modules/**", ".git/**", "dist/**"],
    });
    const matches: string[] = [];
    for (const file of files) {
      if (matches.length >= limit) break;
      const full = path.join(context.cwd, file);
      let raw = "";
      try {
        raw = await readFile(full, "utf8");
      } catch {
        continue;
      }
      const lines = raw.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push(`${normalizeSlashPath(file)}:${i + 1}: ${lines[i]}`);
          if (matches.length >= limit) break;
        }
      }
    }
    return { ok: true, content: matches.length ? matches.join("\n") : "No matches.", metadata: { searched: files.length } };
  },
};

export function allSearchTools(): Tool[] {
  return [GlobTool, GrepTool];
}
