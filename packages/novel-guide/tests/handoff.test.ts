import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { getBuiltinCommands } from "../src/commands/builtin.js";
import { parseEjectArgs, renderEjectHandoff } from "../src/handoff/render.js";

const longText = "x".repeat(1500);

describe("handoff renderer", () => {
  it("parses chapter-target shorthand into an upload package path", () => {
    expect(parseEjectArgs("ch12-revision")).toEqual({
      chapter: "ch12",
      target: "revision",
      profile: "session",
      mode: "extract",
      copy: false,
      bundle: true,
      zip: true,
      inline: false,
    });

    const rendered = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "ch12-revision",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [
        { role: "user", content: "继续 drafts/ch12.md，并注意 canon/characters/lin.md" },
        { role: "assistant", content: "先承接上一章情绪，再推进信息差。" },
      ],
    });

    expect(rendered.relativePath).toBe("handoff/ch12-revision/prompt.md");
    expect(rendered.packageRelativeDir).toBe("handoff/ch12-revision");
    expect(rendered.promptRelativePath).toBe("handoff/ch12-revision/prompt.md");
    expect(rendered.manifestRelativePath).toBe("handoff/ch12-revision/manifest.json");
    expect(rendered.zipRelativePath).toBe("handoff/ch12-revision.zip");
    expect(rendered.bundleRelativeDir).toBe("handoff/ch12-revision/files");
    expect(rendered.referencedFiles).toEqual(["canon/characters/lin.md", "drafts/ch12.md"]);
    expect(rendered.filesToBundle).toEqual(["NOVEL.md", "GUIDE.md", "canon/characters/lin.md", "drafts/ch12.md"]);
    expect(rendered.content).toContain("# Handoff: ch12 revision");
    expect(rendered.content).toContain("drafts/ch12.md");
    expect(rendered.content).toContain("canon/characters/lin.md");
    expect(rendered.content).toContain("no model call");
  });

  it("sanitizes target slugs so output stays under handoff", () => {
    const rendered = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "--chapter 7 --target ../outside",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [],
    });

    expect(rendered.relativePath).toBe("handoff/ch07-outside/prompt.md");
    expect(rendered.relativePath).not.toContain("..");
  });

  it("truncates long messages instead of dumping full transcript", () => {
    const rendered = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "ch01",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [{ role: "user", content: longText }],
    });

    expect(rendered.content).toContain("截断");
    expect(rendered.content).not.toContain(longText);
  });

  it("extracts key workspace file references from recent turns", () => {
    const rendered = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "ch02",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [{ role: "user", content: "读 NOVEL.md、GUIDE.md、canon/settings/world.md 和 drafts/ch02.md" }],
    });

    expect(rendered.content).toContain("NOVEL.md");
    expect(rendered.content).toContain("GUIDE.md");
    expect(rendered.content).toContain("canon/settings/world.md");
    expect(rendered.content).toContain("drafts/ch02.md");
  });

  it("drops traversal-looking file references from bundle inputs", () => {
    const rendered = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "ch02",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [{ role: "user", content: "读 canon/../secret.md 和 drafts/ch02.md" }],
    });

    expect(rendered.filesToBundle).toEqual(["NOVEL.md", "GUIDE.md", "drafts/ch02.md"]);
    expect(rendered.referencedFiles).toEqual(["drafts/ch02.md"]);
  });

  it("parses profile, polish, clipboard, package, zip, and inline flags", () => {
    expect(parseEjectArgs("--chapter 8 --for chatgpt --polish --copy --bundle")).toEqual({
      chapter: "ch08",
      target: "chatgpt",
      profile: "chatgpt",
      mode: "polish",
      copy: true,
      bundle: true,
      zip: true,
      inline: false,
    });
    expect(parseEjectArgs("ch09 --for long-context --copy --no-copy --bundle --no-zip")).toEqual({
      chapter: "ch09",
      target: "long-context",
      profile: "long-context",
      mode: "extract",
      copy: false,
      bundle: true,
      zip: false,
      inline: false,
    });
    expect(parseEjectArgs("ch09 --for gemini --inline")).toEqual({
      chapter: "ch09",
      target: "gemini",
      profile: "gemini",
      mode: "extract",
      copy: false,
      bundle: false,
      zip: false,
      inline: true,
    });
  });

  it("marks package exports and records the upload directory", () => {
    const rendered = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "ch10 --for gemini",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [{ role: "user", content: "请接住 GUIDE.md 和 drafts/ch09.md" }],
    });

    expect(rendered.bundle).toBe(true);
    expect(rendered.filesRelativeDir).toBe("handoff/ch10-gemini/files");
    expect(rendered.content).toContain("File bundle: handoff/ch10-gemini/files");
    expect(rendered.content).toContain("Upload handoff/ch10-gemini.zip");
    expect(rendered.readmeContent).toContain("首选上传 `handoff/ch10-gemini.zip`");
  });

  it("renders profile-specific sections without unrelated product branding", () => {
    const chatgpt = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "ch03 --for chatgpt",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [],
    });
    const longContext = renderEjectHandoff({
      cwd: "/workspace/book",
      sessionId: "session-1",
      args: "ch03 --for long-context",
      nowIso: "2026-06-15T00:00:00.000Z",
      messages: [],
    });

    expect(chatgpt.profile).toBe("chatgpt");
    expect(chatgpt.content).toContain("## ChatGPT setup");
    expect(chatgpt.estimatedTokens).toBeGreaterThan(0);
    expect(longContext.profile).toBe("long-context");
    expect(longContext.content).toContain("<handoff>");
    expect(`${chatgpt.content}\n${longContext.content}`).not.toMatch(/Claude|Anthropic/i);
  });
});

describe("eject command package export", () => {
  it("creates an upload package, manifest, file bundle, and zip", async () => {
    await withTempWorkspace(async (cwd) => {
      await seedWorkspace(cwd);
      const result = await runEject(cwd, "ch12 --for chatgpt", [
        { role: "user", content: "继续 drafts/ch12.md，并查 canon/characters/lin.md" },
      ]);

      expect(result.ok).toBe(true);
      expect(result.content).toContain("上传这个 zip：handoff/ch12-chatgpt.zip");
      expect(result.content).toContain("提示词文件：handoff/ch12-chatgpt/prompt.md");

      const prompt = await readFile(path.join(cwd, "handoff", "ch12-chatgpt", "prompt.md"), "utf8");
      const readme = await readFile(path.join(cwd, "handoff", "ch12-chatgpt", "README.md"), "utf8");
      const manifest = JSON.parse(await readFile(path.join(cwd, "handoff", "ch12-chatgpt", "manifest.json"), "utf8"));
      const zip = await readFile(path.join(cwd, "handoff", "ch12-chatgpt.zip"));
      const zipEntries = listZipEntries(zip);

      expect(prompt).toContain("ChatGPT setup");
      expect(readme).toContain("How to use");
      expect(manifest.expectedFiles.map((entry: { source: string }) => entry.source)).toEqual([
        "NOVEL.md",
        "GUIDE.md",
        "canon/characters/lin.md",
        "drafts/ch12.md",
      ]);
      expect(await stat(path.join(cwd, "handoff", "ch12-chatgpt", "files", "NOVEL.md"))).toBeTruthy();
      expect(await stat(path.join(cwd, "handoff", "ch12-chatgpt", "files", "drafts", "ch12.md"))).toBeTruthy();
      expect(zipEntries).toEqual(expect.arrayContaining([
        "prompt.md",
        "README.md",
        "manifest.json",
        "files/NOVEL.md",
        "files/drafts/ch12.md",
      ]));
    });
  });

  it("records missing core and referenced files instead of failing silently", async () => {
    await withTempWorkspace(async (cwd) => {
      await writeFile(path.join(cwd, "NOVEL.md"), "# Novel\n", "utf8");
      const result = await runEject(cwd, "ch01 --for gemini", [
        { role: "user", content: "继续 drafts/missing.md，并查 canon/characters/missing.md" },
      ]);

      expect(result.ok).toBe(true);
      expect(result.content).toContain("缺失文件清单：handoff/ch01-gemini/manifest.json.missing");
      const missing = await readFile(path.join(cwd, "handoff", "ch01-gemini", "manifest.json.missing"), "utf8");
      expect(missing).toContain("GUIDE.md");
      expect(missing).toContain("drafts/missing.md");
      expect(missing).toContain("canon/characters/missing.md");
      expect(listZipEntries(await readFile(path.join(cwd, "handoff", "ch01-gemini.zip")))).toContain("manifest.json.missing");
    });
  });

  it("creates a usable package even when there are no recent file references", async () => {
    await withTempWorkspace(async (cwd) => {
      await seedWorkspace(cwd);
      const result = await runEject(cwd, "", []);

      expect(result.ok).toBe(true);
      const manifest = JSON.parse(await readFile(path.join(cwd, "handoff", "ch00-session", "manifest.json"), "utf8"));
      expect(manifest.expectedFiles.map((entry: { source: string }) => entry.source)).toEqual(["NOVEL.md", "GUIDE.md"]);
      expect(await readFile(path.join(cwd, "handoff", "ch00-session", "README.md"), "utf8")).toContain("先读取");
    });
  });

  it("writes a single markdown file in inline mode", async () => {
    await withTempWorkspace(async (cwd) => {
      await seedWorkspace(cwd);
      const result = await runEject(cwd, "ch02 --inline", [
        { role: "user", content: "继续 drafts/ch12.md" },
      ]);

      expect(result.ok).toBe(true);
      expect(result.content).toContain("已导出单文件 handoff：handoff/ch02-session.md");
      await expect(stat(path.join(cwd, "handoff", "ch02-session.md"))).resolves.toBeTruthy();
      await expect(stat(path.join(cwd, "handoff", "ch02-session.zip"))).rejects.toThrow();
    });
  });
});

async function runEject(cwd: string, args: string, messages: ChatCompletionMessageParam[]) {
  const command = getBuiltinCommands().find((candidate) => candidate.name === "eject");
  if (!command || command.type !== "local") throw new Error("missing eject command");
  return await command.execute(args, {
    cwd,
    permissionMode: "bypass",
    engine: {
      getSessionId: () => "session-1",
      getMessagesSnapshot: () => messages,
    },
  });
}

async function withTempWorkspace(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "ng-eject-"));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function seedWorkspace(cwd: string): Promise<void> {
  await mkdir(path.join(cwd, "canon", "characters"), { recursive: true });
  await mkdir(path.join(cwd, "drafts"), { recursive: true });
  await writeFile(path.join(cwd, "NOVEL.md"), "# Novel\n", "utf8");
  await writeFile(path.join(cwd, "GUIDE.md"), "# Guide\n", "utf8");
  await writeFile(path.join(cwd, "canon", "characters", "lin.md"), "# Lin\n", "utf8");
  await writeFile(path.join(cwd, "drafts", "ch12.md"), "# Ch12\n", "utf8");
}

function listZipEntries(buffer: Buffer): string[] {
  const entries: string[] = [];
  let offset = 0;
  while (offset <= buffer.length - 46) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
