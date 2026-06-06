import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditFileTool, ReadFileTool, WriteFileTool } from "../src/tools/files.js";
import { GrepTool } from "../src/tools/search.js";
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

  it("gates canon writes", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "canon", "characters"), { recursive: true });
    let asked = false;
    const denied = await runTool(
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
    expect(asked).toBe(true);
    expect(denied.ok).toBe(false);
    await expect(readFile(path.join(cwd, "canon/characters/lin-yan.md"), "utf8")).rejects.toThrow();
  });

  it("caches canon write confirmation within a turn", async () => {
    const cwd = await tempDir();
    let askCount = 0;
    const permissionCache = new Map<string, boolean>();
    const context = {
      cwd,
      permissionMode: "confirm" as const,
      permissionCache,
      askConfirmation: async () => {
        askCount += 1;
        return true;
      },
    };
    const first = await runTool(WriteFileTool, { path: "canon/a.md", content: "a" }, context);
    const second = await runTool(WriteFileTool, { path: "canon/b.md", content: "b" }, context);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(askCount).toBe(1);
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
});
