// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/skills/loadSkillsDir.ts
// Mechanism copied: project skills are directories under .claude/skills with a
// SKILL.md file, parsed as prompt commands with frontmatter metadata.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { PromptCommand } from "../commands/types.js";

export interface SkillDefinition {
  name: string;
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
    .find(Boolean) ?? "Project skill";
}

export async function loadSkillsDir(cwd: string): Promise<SkillDefinition[]> {
  const skillsPath = path.join(cwd, ".claude", "skills");
  let entries;
  try {
    entries = await readdir(skillsPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const baseDir = path.join(skillsPath, entry.name);
    const filePath = path.join(baseDir, "SKILL.md");
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = matter(raw);
      const name = typeof parsed.data.name === "string" ? parsed.data.name : entry.name;
      const description = typeof parsed.data.description === "string"
        ? parsed.data.description
        : firstContentLine(parsed.content);
      skills.push({
        name,
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
  return skills;
}

export function skillToPromptCommand(skill: SkillDefinition): PromptCommand {
  return {
    type: "prompt",
    name: skill.name,
    description: skill.description,
    argumentHint: skill.argumentHint,
    whenToUse: skill.whenToUse,
    userInvocable: skill.userInvocable,
    disableModelInvocation: skill.disableModelInvocation,
    source: "skills",
    async getPromptForCommand(args) {
      return `Base directory for this skill: ${skill.baseDir}\n\n${skill.content.replace(/\{\{args\}\}/g, args)}`;
    },
  };
}
