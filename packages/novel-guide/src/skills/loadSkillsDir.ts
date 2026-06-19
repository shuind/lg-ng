import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { PromptCommand } from "../commands/types.js";
import { WORKSPACE_SKILL_DIRS } from "../workspace/layout.js";
import { normalizeSkillKind, type SkillKind } from "./kind.js";

export interface SkillDefinition {
  name: string;
  kind: SkillKind;
  description: string;
  whenToUse?: string;
  argumentHint?: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  content: string;
  baseDir: string;
}

function boolFromFrontmatter(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  return defaultValue;
}

function firstContentLine(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^#+\s*/, ""))
    .find(Boolean) ?? "项目技能";
}

export async function loadSkillsDir(cwd: string): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];
  const seen = new Set<string>();

  for (const skillsDir of WORKSPACE_SKILL_DIRS) {
    const skillsPath = path.join(cwd, skillsDir);
    let entries;
    try {
      entries = await readdir(skillsPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const baseDir = path.join(skillsPath, entry.name);
      const filePath = path.join(baseDir, "SKILL.md");
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = matter(raw);
        const name = typeof parsed.data.name === "string" ? parsed.data.name : entry.name;
        if (seen.has(name)) continue;
        seen.add(name);
        const description = typeof parsed.data.description === "string"
          ? parsed.data.description
          : firstContentLine(parsed.content);
        skills.push({
          name,
          kind: normalizeSkillKind(parsed.data.kind),
          description,
          whenToUse: typeof parsed.data.when_to_use === "string" ? parsed.data.when_to_use : undefined,
          argumentHint: typeof parsed.data["argument-hint"] === "string" ? parsed.data["argument-hint"] : undefined,
          disableModelInvocation: boolFromFrontmatter(parsed.data["disable-model-invocation"], false),
          userInvocable: boolFromFrontmatter(parsed.data["user-invocable"], true),
          content: parsed.content.trim(),
          baseDir,
        });
      } catch {
        // Skip invalid skill directories; skills are optional.
      }
    }
  }
  return skills;
}

export function skillToPromptCommand(skill: SkillDefinition): PromptCommand {
  return {
    type: "prompt",
    name: skill.name,
    kind: skill.kind,
    description: skill.description,
    argumentHint: skill.argumentHint,
    whenToUse: skill.whenToUse,
    userInvocable: skill.userInvocable,
    disableModelInvocation: skill.disableModelInvocation,
    source: "skills",
    async getPromptForCommand(args) {
      return `此技能根目录：${skill.baseDir}\n\n${skill.content.replace(/\{\{args\}\}/g, args)}`;
    },
  };
}
