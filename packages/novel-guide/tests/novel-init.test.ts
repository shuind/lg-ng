import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initNovelWorkspace } from "../src/novel/init.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "novel-guide-"));
}

describe("novel init", () => {
  it("creates the workspace and does not create git", async () => {
    const cwd = await tempDir();
    const result = await initNovelWorkspace(cwd, "测试小说");
    expect(result.created).toContain("NOVEL.md");
    expect(result.created).toContain(".claude/skills/intake/SKILL.md");
    const novel = await readFile(path.join(cwd, "NOVEL.md"), "utf8");
    expect(novel).toContain("project: 测试小说");
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
});
