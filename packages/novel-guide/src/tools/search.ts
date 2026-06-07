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

function extractTerms(value: string): string[] {
  const terms = new Set<string>();
  for (const run of value.match(/[一-鿿]{2,20}/g) ?? []) {
    for (let size = 2; size <= Math.min(6, run.length); size++) {
      for (let index = 0; index <= run.length - size; index++) {
        terms.add(run.slice(index, index + size).toLowerCase());
      }
    }
  }
  for (const item of value.match(/[a-zA-Z0-9_-]{2,40}/g) ?? []) {
    terms.add(item.toLowerCase());
  }
  return [...terms];
}

function splitParagraphs(content: string): { startLine: number; text: string }[] {
  const paragraphs: { startLine: number; text: string }[] = [];
  const lines = content.split(/\r?\n/);
  let startLine = 1;
  let current: string[] = [];

  function flush(lineNumber: number) {
    const text = current.join("\n").trim();
    if (text) paragraphs.push({ startLine, text });
    current = [];
    startLine = lineNumber;
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) {
      flush(index + 2);
      continue;
    }
    if (/^#{1,6}\s+/.test(line) && current.length > 0) flush(index + 1);
    if (current.length === 0) startLine = index + 1;
    current.push(line);
  }
  flush(lines.length + 1);
  return paragraphs;
}

function extractAliasTerms(content: string, fileName: string): string[] {
  const aliases: string[] = [fileName.replace(/\.[^.]+$/i, "")];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:aliases?|别名|又名|\*\*(?:aliases?|别名|又名)\*\*)\s*[:：]?\s*(.+)$/i);
    if (!match?.[1]) continue;
    aliases.push(...match[1].split(/[、,，;；|/]/).map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(aliases)];
}

export const SearchCanonTool: Tool = {
  name: "search_canon",
  description: "Search novel canon and prose semantically with alias priority and paragraph-level anchors. Prefer this over grep for characters, settings, foreshadowing, and long-form continuity lookup.",
  readonly: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      scope: { type: "string", description: "Optional glob scope. Defaults to canon/drafts/chapter/setting markdown files." },
      limit: { type: "number" },
    },
    required: ["query"],
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const query = str(input.query).trim();
    if (!query) return { ok: false, content: "query is required." };
    const limit = typeof input.limit === "number" && input.limit > 0 ? Math.min(50, Math.floor(input.limit)) : 10;
    const scope = str(input.scope);
    const patterns = scope ? [scope] : [
      "NOVEL.md",
      "canon/**/*.md",
      "drafts/**/*.md",
      "章节正文/**/*.md",
      "人物设定/**/*.md",
      "世界观/**/*.md",
    ];
    const files = await fg(patterns, {
      cwd: context.cwd,
      onlyFiles: true,
      dot: false,
      ignore: ["node_modules/**", ".git/**", ".next/**", ".novel-guide/**", ".lg-checkpoints/**"],
    });
    const queryText = query.toLowerCase();
    const queryTerms = extractTerms(query);
    const hits: {
      path: string;
      line: number;
      score: number;
      excerpt: string;
      matched: string[];
    }[] = [];

    for (const file of files) {
      const full = path.join(context.cwd, file);
      let raw = "";
      try {
        raw = await readFile(full, "utf8");
      } catch {
        continue;
      }

      const fileName = path.basename(file);
      const aliases = extractAliasTerms(raw, fileName);
      const aliasMatches = aliases.filter((alias) => {
        const normalized = alias.toLowerCase();
        return normalized && (queryText.includes(normalized) || normalized.includes(queryText));
      });
      const fileBoost = aliasMatches.length > 0 ? 100 : 0;
      const paragraphs = splitParagraphs(raw);
      for (const paragraph of paragraphs) {
        const normalized = paragraph.text.toLowerCase();
        const matched = queryTerms.filter((term) => normalized.includes(term));
        const direct = normalized.includes(queryText) ? 40 : 0;
        const score = fileBoost + direct + matched.length * 5;
        if (score <= 0) continue;
        hits.push({
          path: normalizeSlashPath(file),
          line: paragraph.startLine,
          score,
          excerpt: paragraph.text.replace(/\s+/g, " ").slice(0, 260),
          matched: [...new Set([...aliasMatches, ...matched])].slice(0, 8),
        });
      }
    }

    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-CN") || a.line - b.line);
    return {
      ok: true,
      content: hits.length
        ? JSON.stringify({ query, hits: hits.slice(0, limit) }, null, 2)
        : JSON.stringify({ query, hits: [] }, null, 2),
      metadata: { total: hits.length },
    };
  },
};

export function allSearchTools(): Tool[] {
  return [GlobTool, GrepTool, SearchCanonTool];
}
