import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSkillsDir, skillToPromptCommand } from "../src/skills/loadSkillsDir.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "novel-guide-skills-"));
}

async function writeSkill(cwd: string, name: string, frontmatter: string): Promise<void> {
  const dir = path.join(cwd, ".novel-guide", "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\n${frontmatter.trim()}\n---\n\n# ${name}\n\nUse it.\n`,
    "utf8",
  );
}

describe("workspace skills", () => {
  it("loads and propagates explicit skill kinds", async () => {
    const cwd = await tempDir();
    await writeSkill(cwd, "voice", [
      "name: voice",
      "kind: writing",
      "description: 写作声音规则",
    ].join("\n"));

    const [skill] = await loadSkillsDir(cwd);
    expect(skill.kind).toBe("writing");
    expect(skillToPromptCommand(skill).kind).toBe("writing");
  });

  it("falls back to method for legacy skills without a valid kind", async () => {
    const cwd = await tempDir();
    await writeSkill(cwd, "legacy", [
      "name: legacy",
      "kind: unknown",
      "description: 旧格式 Skill",
    ].join("\n"));

    const [skill] = await loadSkillsDir(cwd);
    expect(skill.kind).toBe("method");
  });
});
