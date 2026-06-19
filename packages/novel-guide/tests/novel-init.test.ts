import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initNovelWorkspace } from "../src/novel/init.js";
import { templateFiles } from "../src/novel/templates.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "novel-guide-"));
}

describe("novel init", () => {
  it("creates the workspace and does not create git", async () => {
    const cwd = await tempDir();
    const result = await initNovelWorkspace(cwd, "测试小说");
    expect(result.created).toContain("NOVEL.md");
    expect(result.created).toContain("GUIDE.md");
    expect(result.created).toContain(".novel-guide/skills/intake/SKILL.md");
    expect(result.created).toContain(".novel-guide/skills/handoff/SKILL.md");
    expect(result.created).toContain(".novel-guide/agents/chapter-delta.md");
    const novel = await readFile(path.join(cwd, "NOVEL.md"), "utf8");
    const handoffSkill = await readFile(path.join(cwd, ".novel-guide", "skills", "handoff", "SKILL.md"), "utf8");
    const chapterDeltaAgent = await readFile(path.join(cwd, ".novel-guide", "agents", "chapter-delta.md"), "utf8");
    expect(novel).toContain("project: 测试小说");
    expect(handoffSkill).toContain("name: handoff");
    expect(chapterDeltaAgent).toContain("name: chapter-delta");
    expect((await stat(path.join(cwd, "handoff"))).isDirectory()).toBe(true);
    await expect(stat(path.join(cwd, ".git"))).rejects.toThrow();
  });

  it("does not overwrite existing files", async () => {
    const cwd = await tempDir();
    await initNovelWorkspace(cwd, "第一次");
    const second = await initNovelWorkspace(cwd, "第二次");
    expect(second.skipped).toContain("NOVEL.md");
    const novel = await readFile(path.join(cwd, "NOVEL.md"), "utf8");
    expect(novel).toContain("project: 第一次");
    expect(novel).not.toContain("project: 第二次");
  });

  it("emits explicit kind frontmatter for built-in skills", () => {
    const files = templateFiles("测试小说");
    expect(files[".novel-guide/skills/intake/SKILL.md"]).toContain("kind: judgment");
    expect(files[".novel-guide/skills/archive/SKILL.md"]).toContain("kind: method");
    expect(files[".novel-guide/skills/novel-review/SKILL.md"]).toContain("kind: judgment");
    expect(files[".novel-guide/skills/handoff/SKILL.md"]).toContain("kind: method");
  });

  it("keeps checked-in root agent copies aligned with the authoritative templates", async () => {
    const repoRoot = path.resolve(process.cwd(), "..", "..");
    const rootAgentsDir = path.join(repoRoot, ".novel-guide", "agents");
    try {
      await stat(rootAgentsDir);
    } catch {
      return;
    }

    const generatedAgents = Object.entries(templateFiles("测试小说"))
      .filter(([file]) => file.startsWith(".novel-guide/agents/") && file.endsWith(".md"))
      .map(([file, content]) => ({
        name: path.basename(file),
        content,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const checkedInAgents = (await readdir(rootAgentsDir))
      .filter((file) => file.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));

    expect(checkedInAgents).toEqual(generatedAgents.map((agent) => agent.name));
    for (const agent of generatedAgents) {
      const checkedIn = await readFile(path.join(rootAgentsDir, agent.name), "utf8");
      expect(checkedIn).toBe(agent.content);
    }
  });
});
