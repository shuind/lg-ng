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
            choices: [{ message: { role: "assistant", content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

describe("AgentEngine session snapshot", () => {
  it("exposes session id and returns defensive message copies without a model call", async () => {
    const cwd = await tempDir();
    let calls = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            calls += 1;
            return {
              choices: [{ message: { role: "assistant", content: "unused" } }],
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
      sessionId: "snapshot-session",
      initialMessages: [{ role: "user", content: "previous request" }],
    });

    const snapshot = engine.getMessagesSnapshot();
    snapshot[0].content = "mutated";

    expect(engine.getSessionId()).toBe("snapshot-session");
    expect(engine.getMessagesSnapshot()[0].content).toBe("previous request");
    expect(calls).toBe(0);
  });
});

describe("AgentEngine subagents", () => {
  it("runs subagents as isolated readonly turns by default", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, ".novel-guide", "agents"), { recursive: true });
    await writeFile(
      path.join(cwd, ".novel-guide", "agents", "continuity-checker.md"),
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

describe("AgentEngine project context", () => {
  it("surfaces project memory as a stable system context, not in the user message", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "skills"), { recursive: true });
    await writeFile(
      path.join(cwd, "NOVEL.md"),
      [
        "---",
        "project: test",
        "type: novel-workspace",
        "---",
        "",
        "# Test Novel",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(cwd, "GUIDE.md"),
      "# Project Guide\n\nUse the hundred year storm as a recurring omen.",
      "utf8",
    );
    await writeFile(
      path.join(cwd, "skills", "style.md"),
      "# Style\n\nKeep chapter endings sharp and unresolved.",
      "utf8",
    );

    let modelMessages: { role?: string; content?: unknown }[] = [];
    const client = {
      chat: {
        completions: {
          create: async (input: { messages: { role?: string; content?: unknown }[] }) => {
            modelMessages = input.messages.map((message) => ({ ...message }));
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

    await engine.submitMessage("write chapter one", { save: false });

    const projectContext = modelMessages.find((message) =>
      message.role === "system" &&
      typeof message.content === "string" &&
      message.content.startsWith("NG_PROJECT_CONTEXT:")
    )?.content;
    const lastUser = modelMessages.at(-1)?.content;
    expect(projectContext).toContain("LG 旧素材索引");
    expect(projectContext).toContain("GUIDE.md");
    expect(projectContext).toContain("hundred year storm");
    expect(projectContext).toContain("skills/style.md");
    expect(projectContext).toContain("chapter endings");
    expect(lastUser).toBe("用户请求：\nwrite chapter one");
  });

  it("uses configured project context and does not persist it into session history", async () => {
    const cwd = await tempDir();
    let calls = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            calls += 1;
            if (calls === 1) {
              return {
                choices: [{
                  message: {
                    role: "assistant",
                    content: "",
                    tool_calls: [{
                      id: "tc1",
                      type: "function",
                      function: {
                        name: "write_file",
                        arguments: "{\"path\":\"notes.md\",\"content\":\"new notes\"}",
                      },
                    }],
                  },
                }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              };
            }
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
      sessionId: "change-memo",
      projectContext: "Stable index:\n- Notes | path=notes.md",
      permissionMode: "bypass",
    });

    const result = await engine.submitMessage("write notes", { save: false });
    const rendered = JSON.stringify(result.messages);

    expect(calls).toBe(2);
    expect(rendered).not.toContain("NG_PROJECT_CONTEXT");
    expect(rendered).toContain("NG_CHANGE_MEMO");
    expect(rendered).toContain("write notes.md");
    expect(rendered).toContain("用户请求：\\nwrite notes");
  });

  it("repairs preloaded sessions that are missing a primary system prompt", async () => {
    const cwd = await tempDir();
    let modelMessages: { role?: string; content?: unknown }[] = [];
    const client = {
      chat: {
        completions: {
          create: async (input: { messages: { role?: string; content?: unknown }[] }) => {
            modelMessages = input.messages.map((message) => ({ ...message }));
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
      sessionId: "missing-system",
      initialMessages: [{ role: "user", content: "previous request" }],
      projectContext: "Stable index",
    });

    const result = await engine.submitMessage("new request", { save: false });

    expect(modelMessages[0]?.role).toBe("system");
    expect(modelMessages[1]?.content).toContain("NG_PROJECT_CONTEXT");
    expect(result.messages[0]?.role).toBe("system");
    expect(JSON.stringify(result.messages)).not.toContain("NG_PROJECT_CONTEXT");
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
    expect(rendered).not.toContain("NG_PROJECT_CONTEXT");
  });
});
