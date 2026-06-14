import { describe, expect, it } from "vitest";
import { parseEjectArgs, renderEjectHandoff } from "../src/handoff/render.js";

const longText = "x".repeat(1500);

describe("handoff renderer", () => {
  it("parses chapter-target shorthand into a handoff path", () => {
    expect(parseEjectArgs("ch12-revision")).toEqual({ chapter: "ch12", target: "revision" });

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

    expect(rendered.relativePath).toBe("handoff/ch12-revision.md");
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

    expect(rendered.relativePath).toBe("handoff/ch07-outside.md");
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
});
