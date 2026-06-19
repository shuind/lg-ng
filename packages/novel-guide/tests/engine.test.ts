import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { AgentEngine } from "../src/agent/engine.js";
import { sessionPath, type SessionState } from "../src/agent/session.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "novel-guide-engine-"));
}

async function readSavedSession(cwd: string, id: string): Promise<SessionState> {
  return JSON.parse(await readFile(sessionPath(cwd, id), "utf8")) as SessionState;
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

  it("polishes handoff drafts with one direct model call without mutating session history", async () => {
    const cwd = await tempDir();
    let calls = 0;
    let modelInput: { messages?: { role?: string; content?: unknown }[]; tools?: unknown } = {};
    const client = {
      chat: {
        completions: {
          create: async (input: { messages?: { role?: string; content?: unknown }[]; tools?: unknown }) => {
            calls += 1;
            modelInput = input;
            return {
              choices: [{ message: { role: "assistant", content: "polished draft" } }],
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
      sessionId: "polish-session",
      initialMessages: [{ role: "user", content: "keep me" }],
    });

    const result = await engine.polishHandoffDraft("raw draft", { profile: "chatgpt", chapter: "ch01", target: "chatgpt" });

    expect(result).toBe("polished draft");
    expect(calls).toBe(1);
    expect(modelInput.tools).toBeUndefined();
    expect(JSON.stringify(modelInput.messages)).toContain("禁止新增事实");
    expect(engine.getMessagesSnapshot()).toEqual([{ role: "user", content: "keep me" }]);
  });
});

describe("AgentEngine subagents", () => {
  it("runs subagents as full-access isolated turns by default", async () => {
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
    expect(seenTools).toContain("write_file");
    expect(seenTools).toContain("edit_file");
    await expect(access(sessionPath(cwd, result.sessionId))).rejects.toThrow();
  });

  it("exposes a readonly subagent wrapper for local commands", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, ".novel-guide", "agents"), { recursive: true });
    await writeFile(
      path.join(cwd, ".novel-guide", "agents", "chapter-delta.md"),
      [
        "---",
        "name: chapter-delta",
        "description: readonly chapter delta",
        "tools: [read_file, grep, glob]",
        "---",
        "Return chapter delta.",
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

    const text = await engine.runReadonlySubAgent({ agent: "chapter-delta", prompt: "drafts/ch01.md" });

    expect(text).toContain("ok");
    expect(seenTools).toContain("read_file");
    expect(seenTools).toContain("git_status");
    expect(seenTools).toContain("git_diff");
    expect(seenTools).not.toContain("git_init");
    expect(seenTools).not.toContain("write_file");
  });

  it("inherits parent user memory when running subagents", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, ".novel-guide", "agents"), { recursive: true });
    await writeFile(
      path.join(cwd, ".novel-guide", "agents", "memory-aware.md"),
      [
        "---",
        "name: memory-aware",
        "description: checks inherited context",
        "---",
        "Return what matters.",
      ].join("\n"),
      "utf8",
    );

    let modelMessages: { role?: string; content?: unknown }[] = [];
    const client = {
      chat: {
        completions: {
          create: async (input: { messages: { role?: string; content?: unknown }[] }) => {
            modelMessages = input.messages.map((message) => ({ ...message }));
            return {
              choices: [{ message: { role: "assistant", content: "ok" } }],
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
      sessionId: "main-session",
      userMemoryContext: "THREAD MEMORY: keep this preference",
    });

    await engine.runSubAgent({ agent: "memory-aware", prompt: "check" });

    expect(JSON.stringify(modelMessages)).toContain("NG_USER_MEMORY");
    expect(JSON.stringify(modelMessages)).toContain("THREAD MEMORY: keep this preference");
  });
});

describe("AgentEngine runtime context", () => {
  it("does not inject project context", async () => {
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
      sessionId: "no-project-context",
      permissionMode: "bypass",
    });

    await engine.submitMessage("write chapter one", { save: false });
    expect(String(modelMessages.at(-1)?.content)).toContain("write chapter one");
  });

  it("records change memo without project context", async () => {
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
                        arguments: JSON.stringify({ path: "notes.md", content: "new notes" }),
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
      permissionMode: "bypass",
    });

    const result = await engine.submitMessage("write notes", { save: false });
    const rendered = JSON.stringify(result.messages);

    expect(calls).toBe(2);
    expect(rendered).toContain("NG_CHANGE_MEMO");
    expect(rendered).toContain("write notes.md");
    expect(rendered).toContain("write notes");
  });

  it("reports current turn context with prompt and output reserve components", async () => {
    const cwd = await tempDir();
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "done" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        },
      },
    } as unknown as OpenAI;
    const engine = new AgentEngine({
      cwd,
      client,
      model: "mock",
      sessionId: "turn-budget",
      contextBudgetTokens: 8000,
      expectedOutputReserveTokens: 2000,
    });

    const result = await engine.submitMessage("current prompt " + "x".repeat(1000), { save: false });

    expect(result.contextWindow.reserveTokens).toBe(2000);
    expect(result.contextWindow.components.sessionMessages).toBeGreaterThan(0);
    expect(result.contextWindow.components.currentPrompt).toBeGreaterThan(0);
    expect(result.contextWindow.components.expectedOutputReserve).toBe(2000);
    expect(result.contextWindow.estimatedTokens).toBe(result.contextWindow.components.total);
    expect(result.contextWindow.level).toBe("normal");
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
    });

    const result = await engine.submitMessage("new request");

    expect(modelMessages[0]?.role).toBe("system");
    expect(result.messages[0]?.role).toBe("system");
  });

  it("injects user memory and does not persist it into session history", async () => {
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
      sessionId: "user-memory-context",
      userMemoryContext: "NG_USER_MEMORY:\n- prefer conclusion first",
    });

    const result = await engine.submitMessage("new request");

    expect(String(modelMessages[1]?.content)).toContain("NG_USER_MEMORY");
    expect(String(modelMessages[1]?.content)).toContain("prefer conclusion first");
    expect(JSON.stringify(result.messages)).not.toContain("NG_USER_MEMORY");
  });
});

describe("AgentEngine compaction", () => {
  it("does not compact deepseek sessions below the larger default budget", async () => {
    const cwd = await tempDir();
    let calls = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            calls += 1;
            return {
              choices: [{ message: { role: "assistant", content: "done" } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          },
        },
      },
    } as unknown as OpenAI;
    const initialMessages = [
      { role: "system" as const, content: "system" },
      ...Array.from({ length: 40 }, (_, index) => ({
        role: (index % 2 === 0 ? "user" : "assistant") as const,
        content: `history-${index} ${"x".repeat(2200)}`,
      })),
    ];
    const engine = new AgentEngine({
      cwd,
      client,
      model: "deepseek-v4-flash",
      sessionId: "large-default-budget",
      initialMessages,
    });

    const result = await engine.submitMessage("new request");
    const rendered = JSON.stringify(result.messages);

    expect(calls).toBe(1);
    expect(rendered).not.toContain("NG_COMPACTION_MEMO");
    expect(rendered).toContain("history-0");
  });

  it("summarizes old messages with a structured checkpoint and keeps recent messages", async () => {
    const cwd = await tempDir();
    let calls = 0;
    let compactionInput: { messages?: { role?: string; content?: unknown }[]; max_tokens?: number } | null = null;
    const client = {
      chat: {
        completions: {
          create: async (input: { messages?: { role?: string; content?: unknown }[]; max_tokens?: number }) => {
            calls += 1;
            if (calls === 1) compactionInput = input;
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
      { role: "system" as const, content: "NG_CHANGE_MEMO:\nchanged notes.md" },
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
      compactionTriggerTokens: 80,
      recentMessageCount: 2,
    });

    const result = await engine.submitMessage("new request");
    const rendered = JSON.stringify(result.messages);

    expect(calls).toBe(2);
    expect(compactionInput?.max_tokens).toBe(3200);
    expect(JSON.stringify(compactionInput?.messages)).toContain("用户目标与当前任务");
    expect(JSON.stringify(compactionInput?.messages)).toContain("用户明确纠正 / 偏好 / 禁止事项");
    expect(JSON.stringify(compactionInput?.messages)).toContain("用户最后一次明确拍板");
    expect(JSON.stringify(compactionInput?.messages)).toContain("当前章节/文件目标");
    expect(JSON.stringify(compactionInput?.messages)).toContain("当前正在做什么");
    expect(JSON.stringify(compactionInput?.messages)).toContain("previous memo");
    expect(JSON.stringify(compactionInput?.messages)).toContain("NG_CHANGE_MEMO");
    expect(rendered).toContain("NG_COMPACTION_MEMO");
    expect(rendered).toContain("summary memo");
    expect(rendered).toContain("old-19");
    expect(rendered).not.toContain("old-0");
    expect(rendered).not.toContain("previous memo");
    expect(rendered).not.toContain("NG_CHANGE_MEMO");
    expect(rendered.match(/NG_COMPACTION_MEMO/g)).toHaveLength(1);

    const saved = await readSavedSession(cwd, result.sessionId);
    const boundary = saved.compaction?.boundaries?.find((item) => item.strategy === "full-summary");
    expect(boundary).toBeDefined();
    if (!boundary) throw new Error("missing full compaction boundary");
    expect(boundary.summaryMessageId).toMatch(/^memo-/);
    expect(boundary.retryCount).toBe(0);
    expect(boundary.tokenBefore).toBeGreaterThan(boundary.tokenAfter);
    expect(boundary.compactedMessageRange).toEqual({ start: 0, end: 19 });
    expect(boundary.preservedRecentMessageRange).toEqual({ start: 18, end: 19 });
    expect(boundary.droppedMessageGroups).toBeUndefined();
  });

  it("retries full compaction by dropping oldest message groups when the compact prompt is too long", async () => {
    const cwd = await tempDir();
    let calls = 0;
    const compactionInputs: string[] = [];
    const client = {
      chat: {
        completions: {
          create: async (input: { messages?: { role?: string; content?: unknown }[] }) => {
            calls += 1;
            if (calls <= 2) {
              compactionInputs.push(JSON.stringify(input.messages));
              if (calls === 1) throw new Error("prompt too long");
              return {
                choices: [{ message: { role: "assistant", content: "retry summary memo" } }],
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
    const initialMessages = [
      { role: "system" as const, content: "system" },
      ...Array.from({ length: 12 }, (_, index) => ({
        role: (index % 2 === 0 ? "user" : "assistant") as const,
        content: `old-${index} ${"x".repeat(400)}`,
      })),
    ];
    const engine = new AgentEngine({
      cwd,
      client,
      model: "mock",
      sessionId: "compact-retry-session",
      initialMessages,
      contextBudgetTokens: 160,
      compactionTriggerTokens: 80,
      recentMessageCount: 2,
    });

    const result = await engine.submitMessage("new request");

    expect(calls).toBe(3);
    expect(compactionInputs).toHaveLength(2);
    expect(compactionInputs[0]).toContain("old-0");
    expect(compactionInputs[1]).not.toContain("old-0");
    expect(compactionInputs[1]).not.toContain("old-1");
    expect(compactionInputs[1]).toContain("old-2");
    expect(compactionInputs[1]).toContain(
      "NOTICE: The oldest message groups were dropped because the compaction prompt was too long.",
    );
    expect(compactionInputs[1]).toContain("Dropped message groups: 1; dropped messages: 2");

    const saved = await readSavedSession(cwd, result.sessionId);
    const boundary = saved.compaction?.boundaries?.find((item) => item.strategy === "full-summary");
    expect(boundary).toBeDefined();
    if (!boundary) throw new Error("missing retry compaction boundary");
    expect(boundary.retryCount).toBe(1);
    expect(boundary.droppedMessageGroups).toEqual([{
      startIndex: 0,
      endIndex: 1,
      messageCount: 2,
      reason: "prompt_too_long",
      roles: ["user", "assistant"],
    }]);
    expect(boundary.compactedMessageRange).toEqual({ start: 2, end: 9 });
    expect(boundary.preservedRecentMessageRange).toEqual({ start: 10, end: 11 });
  });

  it("microcompacts older large tool results before full compaction", async () => {
    const cwd = await tempDir();
    let calls = 0;
    let modelMessages: { role?: string; content?: unknown }[] = [];
    const client = {
      chat: {
        completions: {
          create: async (input: { messages?: { role?: string; content?: unknown }[] }) => {
            calls += 1;
            modelMessages = input.messages?.map((message) => ({ ...message })) ?? [];
            return {
              choices: [{ message: { role: "assistant", content: "done" } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          },
        },
      },
    } as unknown as OpenAI;
    const initialMessages = [
      { role: "system" as const, content: "system" },
      ...Array.from({ length: 3 }, (_, index) => ({
        role: "tool" as const,
        tool_call_id: `call-${index}`,
        content: `tool-output-${index} ${"x".repeat(10000)} UNIQUE_TAIL_${index}`,
      })),
      { role: "user" as const, content: "recent user" },
      { role: "assistant" as const, content: "recent assistant" },
    ];
    const engine = new AgentEngine({
      cwd,
      client,
      model: "mock",
      sessionId: "microcompact-session",
      initialMessages,
      contextBudgetTokens: 10000,
      recentMessageCount: 2,
    });

    const result = await engine.submitMessage("new request");
    const rendered = JSON.stringify(result.messages);

    expect(calls).toBe(1);
    expect(rendered).toContain("NG_MICROCOMPACTED_TOOL_RESULT");
    expect(rendered).toContain("tool_call_id: call-0");
    expect(rendered).toContain("status: success");
    expect(rendered).toContain("original_chars");
    expect(rendered).toContain("tool-output-0");
    expect(rendered).not.toContain("UNIQUE_TAIL_0");
    expect(rendered).not.toContain("NG_COMPACTION_MEMO");
    expect(JSON.stringify(modelMessages)).toContain("NG_MICROCOMPACTED_TOOL_RESULT");

    const saved = await readSavedSession(cwd, result.sessionId);
    const boundary = saved.compaction?.boundaries?.find((item) => item.strategy === "microcompact");
    expect(boundary).toBeDefined();
    if (!boundary) throw new Error("missing microcompact boundary");
    expect(boundary.microcompactedToolResults).toBe(3);
    expect(boundary.compactedMessageRange).toEqual({ start: 1, end: 3 });
    expect(boundary.tokenBefore).toBeGreaterThan(boundary.tokenAfter);
  });
});
