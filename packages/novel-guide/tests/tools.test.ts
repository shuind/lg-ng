import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditFileTool, ProposeFileChangeTool, ReadFileTool, WriteFileTool } from "../src/tools/files.js";
import { GrepTool, SearchCanonTool } from "../src/tools/search.js";
import { ShellTool } from "../src/tools/shell.js";
import { getTools } from "../src/tools/registry.js";
import { GitInitTool, GitStatusTool } from "../src/tools/git.js";
import { runTool } from "../src/tools/tool.js";
import { splitChapterOutlineDocument } from "../src/novel/chapterOutline.js";

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

  it("reads only the requested line range with offset and limit", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "drafts"), { recursive: true });
    await writeFile(
      path.join(cwd, "drafts", "chapter.md"),
      ["line one", "line two", "line three", "line four"].join("\n"),
      "utf8",
    );

    const result = await runTool(
      ReadFileTool,
      { path: "drafts/chapter.md", offset: 2, limit: 2 },
      { cwd },
    );

    expect(result.ok).toBe(true);
    expect(result.content).toContain("行：2-3/4");
    expect(result.content).toContain("line two\nline three");
    expect(result.content).not.toContain("line one");
    expect(result.content).not.toContain("line four");
    expect(result.metadata?.totalLines).toBe(4);
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

  it("rejects multi-chapter content in one chapter outline file", async () => {
    const cwd = await tempDir();
    const content = [
      "# 第一卷章节大纲",
      "",
      "## 第1章：药园里的避雷竹",
      "本章功能。",
      "",
      "## 第2章：五灵根的许师兄",
      "本章功能。",
    ].join("\n");

    const result = await runTool(
      WriteFileTool,
      { path: "章节大纲/第一卷.md", content },
      { cwd },
    );

    expect(result.ok).toBe(false);
    expect(result.content).toContain("多章章纲不能写入单个章节大纲文件");
    await expect(readFile(path.join(cwd, "章节大纲", "第一卷.md"), "utf8")).rejects.toThrow();
  });

  it("allows single chapter outlines and volume outlines", async () => {
    const cwd = await tempDir();
    const singleChapter = await runTool(
      WriteFileTool,
      {
        path: "章节大纲/第1章 · 药园里的避雷竹.md",
        content: "# 第1章 · 药园里的避雷竹\n\n## 本章功能\n建立开篇。",
      },
      { cwd },
    );
    const volume = await runTool(
      WriteFileTool,
      {
        path: "卷纲/第一卷.md",
        content: "# 第一卷\n\n## 第1章\n## 第2章",
      },
      { cwd },
    );

    expect(singleChapter.ok).toBe(true);
    expect(volume.ok).toBe(true);
    await expect(readFile(path.join(cwd, "章节大纲", "第1章 · 药园里的避雷竹.md"), "utf8")).resolves.toContain("建立开篇");
    await expect(readFile(path.join(cwd, "卷纲", "第一卷.md"), "utf8")).resolves.toContain("第2章");
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
    expect(result.content).toContain("路径超出工作区");
  });

  it("returns tool failures as results", async () => {
    const cwd = await tempDir();
    await writeFile(path.join(cwd, "a.md"), "hello", "utf8");
    const result = await runTool(ReadFileTool, { path: "missing.md" }, { cwd });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("read_file 失败");
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

  it("splits a volume-level chapter outline into volume and per-chapter files", () => {
    const content = [
      "# 第一卷《青岚夜雷》章节大纲",
      "",
      "## 卷核心",
      "卷级内容。",
      "",
      ...Array.from({ length: 10 }, (_, index) => [
        `## 第${index + 1}章：章节标题${index + 1}`,
        "",
        "### 本章功能",
        `第${index + 1}章功能。`,
      ].join("\n\n")),
    ].join("\n\n---\n\n");

    const result = splitChapterOutlineDocument(content, "第一卷-青岚夜雷");

    expect(result.volume?.fileName).toBe("第一卷 · 青岚夜雷.md");
    expect(result.volume?.content).toContain("卷级内容");
    expect(result.chapters).toHaveLength(10);
    expect(result.chapters[0]).toMatchObject({
      title: "第1章 · 章节标题1",
      fileName: "第1章 · 章节标题1.md",
    });
    expect(result.chapters[9].content).toContain("# 第10章 · 章节标题10");
  });

  it("requires confirmation for dangerous shell commands even in bypass mode", async () => {
    const cwd = await tempDir();
    const result = await runTool(ShellTool, { command: "git reset --hard" }, { cwd });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("权限被拒绝");
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

  it("can initialize git before checking status in a new workspace", async () => {
    const cwd = await tempDir();

    const before = await runTool(GitStatusTool, {}, { cwd });
    expect(before.ok).toBe(true);
    expect(before.content).toContain("不是 git 仓库");

    const init = await runTool(GitInitTool, {}, { cwd });
    expect(init.ok).toBe(true);

    const after = await runTool(GitStatusTool, {}, { cwd });
    expect(after.ok).toBe(true);
    expect(after.content).toBe("工作区干净。");
  });

  it("proposal mode exposes read tools and propose_file_change only", () => {
    const names = getTools({ proposalOnly: true }).map((tool) => tool.name);
    expect(names).toContain("read_file");
    expect(names).toContain("grep");
    expect(names).not.toContain("run_agent");
    expect(names).toContain("propose_file_change");
    expect(names).not.toContain("write_file");
    expect(names).not.toContain("edit_file");
    expect(names).not.toContain("shell");
  });
});
