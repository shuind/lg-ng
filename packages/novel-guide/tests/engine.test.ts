import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { AgentEngine } from "../src/agent/engine.js";
import { sessionPath } from "../src/agent/session.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "novel-guide-engine-"));
}

function mockClient(seenTools: string[]): OpenAI {
  return {
    chat: {
      completions: {
        create: async (input: { tools?: { function?: { name?: string } }[] }) => {
          seenTools.push(...(input.tools ?? []).map((tool) => tool.function?.name ?? ""));
          return {
            choices: [{ message: { role: "assistant", content: "## 摘要\nok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

describe("AgentEngine subagents", () => {
  it("runs subagents as isolated readonly turns by default", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, ".claude", "agents"), { recursive: true });
    await writeFile(
      path.join(cwd, ".claude", "agents", "continuity-checker.md"),
      [
        "---",
        "name: continuity-checker",
        "description: readonly review",
        "tools: [read_file, grep, glob]",
        "---",
        "Return a structured report.",
      ].join("\n"),
      "utf8",
    );

    const seenTools: string[] = [];
    const engine = new AgentEngine({
      cwd,
      client: mockClient(seenTools),
      model: "mock",
      sessionId: "main-session",
      permissionMode: "bypass",
    });

    const result = await engine.runSubAgent({
      agent: "continuity-checker",
      prompt: "check the book",
    });

    expect(result.text).toContain("ok");
    expect(seenTools).toContain("read_file");
    expect(seenTools).toContain("grep");
    expect(seenTools).not.toContain("write_file");
    expect(seenTools).not.toContain("edit_file");
    await expect(access(sessionPath(cwd, result.sessionId))).rejects.toThrow();
  });
});

describe("AgentEngine project memory", () => {
  it("surfaces LG legacy material index in the user context", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "世界观"), { recursive: true });
    await mkdir(path.join(cwd, "卷纲"), { recursive: true });
    await writeFile(
      path.join(cwd, "NOVEL.md"),
      [
        "---",
        "project: 长生",
        "type: novel-workspace",
        "---",
        "",
        "# 长生",
        "",
        "## 核心实体清单",
        "- TODO",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(cwd, "世界观", "天轮与岁轮.md"),
      "# 天轮与岁轮\n\n顾慎的百岁雷劫被瞒天佩延迟。",
      "utf8",
    );
    await writeFile(
      path.join(cwd, "卷纲", "第一卷.md"),
      "# 第一卷\n\n第 1 章：《第七天，雷云开始聚》。",
      "utf8",
    );

    let userContext = "";
    const client = {
      chat: {
        completions: {
          create: async (input: { messages: { role?: string; content?: unknown }[] }) => {
            const last = input.messages.at(-1);
            userContext = typeof last?.content === "string" ? last.content : "";
            return {
              choices: [{ message: { role: "assistant", content: "done" } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          },
        },
      },
    } as unknown as OpenAI;
    const engine = new AgentEngine({
      cwd,
      client,
      model: "mock",
      sessionId: "legacy-memory",
      permissionMode: "bypass",
    });

    await engine.submitMessage("写第一章", { save: false });

    expect(userContext).toContain("LG legacy material index");
    expect(userContext).toContain("世界观/天轮与岁轮.md");
    expect(userContext).toContain("百岁雷劫");
    expect(userContext).toContain("卷纲/第一卷.md");
    expect(userContext).toContain("雷云开始聚");
  });
});

describe("AgentEngine compaction", () => {
  it("summarizes old messages and keeps recent messages", async () => {
    const cwd = await tempDir();
    let calls = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            calls += 1;
            return {
              choices: [{
                message: {
                  role: "assistant",
                  content: calls === 1 ? "summary memo" : "done",
                },
              }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          },
        },
      },
    } as unknown as OpenAI;
    const initialMessages = [
      { role: "system" as const, content: "system" },
      { role: "system" as const, content: "NG_COMPACTION_MEMO:\nprevious memo" },
      ...Array.from({ length: 20 }, (_, index) => ({
        role: (index % 2 === 0 ? "user" : "assistant") as const,
        content: `old-${index} ${"x".repeat(120)}`,
      })),
    ];
    const engine = new AgentEngine({
      cwd,
      client,
      model: "mock",
      sessionId: "compact-session",
      initialMessages,
      contextBudgetTokens: 120,
      recentMessageCount: 2,
    });

    const result = await engine.submitMessage("new request", { save: false });
    const rendered = JSON.stringify(result.messages);

    expect(calls).toBe(2);
    expect(rendered).toContain("NG_COMPACTION_MEMO");
    expect(rendered).toContain("previous memo");
    expect(rendered).toContain("summary memo");
    expect(rendered).toContain("old-19");
    expect(rendered).not.toContain("old-0");
  });
});
