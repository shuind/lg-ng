import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditFileTool, ProposeFileChangeTool, ReadFileTool, WriteFileTool } from "../src/tools/files.js";
import { GrepTool, SearchCanonTool } from "../src/tools/search.js";
import { ShellTool } from "../src/tools/shell.js";
import { getTools } from "../src/tools/registry.js";
import { runTool } from "../src/tools/tool.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "novel-guide-tools-"));
}

describe("workspace tools", () => {
  it("reads, writes, and greps real files", async () => {
    const cwd = await tempDir();
    const write = await runTool(
      WriteFileTool,
      { path: "drafts/ch01.md", content: "hero wakes\njade heats" },
      { cwd, askConfirmation: async () => true },
    );
    expect(write.ok).toBe(true);
    expect(write.metadata?.fileChanges).toEqual([{
      path: "drafts/ch01.md",
      operation: "write",
      beforeExists: false,
      charCount: "hero wakes\njade heats".length,
      beforeContent: null,
      afterContent: "hero wakes\njade heats",
    }]);
    const read = await runTool(ReadFileTool, { path: "drafts/ch01.md" }, { cwd });
    expect(read.content).toContain("jade heats");
    const grep = await runTool(GrepTool, { pattern: "jade", include: "drafts/**/*.md" }, { cwd });
    expect(grep.content).toContain("drafts/ch01.md:2");
  });

  it("allows canon writes without file-specific confirmation", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "canon", "characters"), { recursive: true });
    let asked = false;
    const result = await runTool(
      WriteFileTool,
      { path: "canon/characters/lin-yan.md", content: "x" },
      {
        cwd,
        permissionMode: "confirm",
        askConfirmation: async () => {
          asked = true;
          return false;
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(asked).toBe(false);
    await expect(readFile(path.join(cwd, "canon/characters/lin-yan.md"), "utf8")).resolves.toBe("x");
  });

  it("bypasses permissions by default", async () => {
    const cwd = await tempDir();
    let asked = false;
    const result = await runTool(
      WriteFileTool,
      { path: "canon/direct.md", content: "direct" },
      {
        cwd,
        askConfirmation: async () => {
          asked = true;
          return false;
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(asked).toBe(false);
    await expect(readFile(path.join(cwd, "canon/direct.md"), "utf8")).resolves.toBe("direct");
  });

  it("reports edit metadata with before and after snapshots", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "drafts"), { recursive: true });
    await writeFile(path.join(cwd, "drafts", "ch02.md"), "old line\nkeep", "utf8");

    const result = await runTool(
      EditFileTool,
      { path: "drafts/ch02.md", old_text: "old line", new_text: "new line" },
      { cwd },
    );

    expect(result.ok).toBe(true);
    expect(result.metadata?.fileChanges).toEqual([{
      path: "drafts/ch02.md",
      operation: "edit",
      beforeExists: true,
      charCount: "new line\nkeep".length,
      beforeContent: "old line\nkeep",
      afterContent: "new line\nkeep",
    }]);
  });

  it("rejects paths outside the workspace", async () => {
    const cwd = await tempDir();
    const result = await runTool(WriteFileTool, { path: "../escape.md", content: "x" }, { cwd });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("Path escapes workspace");
  });

  it("returns tool failures as results", async () => {
    const cwd = await tempDir();
    await writeFile(path.join(cwd, "a.md"), "hello", "utf8");
    const result = await runTool(ReadFileTool, { path: "missing.md" }, { cwd });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("read_file failed");
  });

  it("searches canon by alias with paragraph anchors", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "canon", "characters"), { recursive: true });
    await writeFile(
      path.join(cwd, "canon", "characters", "gu-shen.md"),
      [
        "# 顾慎",
        "aliases: 老顾、顾郎",
        "",
        "顾慎当前境界是筑基后期。",
        "",
        "他曾远远窥见欺天大阵。",
      ].join("\n"),
      "utf8",
    );

    const result = await runTool(SearchCanonTool, { query: "老顾境界", limit: 3 }, { cwd });
    expect(result.ok).toBe(true);
    expect(result.content).toContain("canon/characters/gu-shen.md");
    expect(result.content).toContain("\"line\"");
  });

  it("searches LG legacy outline directories by default", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "卷纲"), { recursive: true });
    await writeFile(
      path.join(cwd, "卷纲", "第一卷.md"),
      [
        "# 第一卷",
        "",
        "第 1 章：《第七天，雷云开始聚》。顾慎在地下废弃阵眼等待百岁雷劫。",
      ].join("\n"),
      "utf8",
    );

    const result = await runTool(SearchCanonTool, { query: "顾慎 雷云", limit: 3 }, { cwd });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("卷纲/第一卷.md");
    expect(result.content).toContain("雷云开始聚");
  });

  it("requires confirmation for dangerous shell commands even in bypass mode", async () => {
    const cwd = await tempDir();
    const result = await runTool(ShellTool, { command: "git reset --hard" }, { cwd });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("Permission denied");
  });

  it("proposes file changes without mutating files", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "drafts"), { recursive: true });
    const target = path.join(cwd, "drafts", "ch03.md");
    await writeFile(target, "old", "utf8");

    const result = await runTool(
      ProposeFileChangeTool,
      { path: "drafts/ch03.md", after_content: "new", summary: "revise opening", source: "workflow" },
      { cwd },
    );

    expect(result.ok).toBe(true);
    expect(result.metadata?.proposals).toEqual([{
      path: "drafts/ch03.md",
      beforeExists: true,
      beforeContent: "old",
      afterContent: "new",
      summary: "revise opening",
      source: "workflow",
    }]);
    await expect(readFile(target, "utf8")).resolves.toBe("old");
  });

  it("proposal mode exposes read tools and propose_file_change only", () => {
    const names = getTools({ proposalOnly: true }).map((tool) => tool.name);
    expect(names).toContain("read_file");
    expect(names).toContain("grep");
    expect(names).toContain("run_agent");
    expect(names).toContain("propose_file_change");
    expect(names).not.toContain("write_file");
    expect(names).not.toContain("edit_file");
    expect(names).not.toContain("shell");
  });
});
