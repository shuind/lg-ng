import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChatCompletion, createChatCompletionStream } from "../src/model/deepseek.js";

const ENV_KEYS = ["NODE_ENV", "NG_API_DEBUG_LOG", "NG_API_DEBUG_LOG_DIR", "LG_DATA_DIR"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let tempDir = "";

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

async function readLogEntries(): Promise<Record<string, unknown>[]> {
  const logPath = path.join(tempDir, "model-api-calls.jsonl");
  const raw = await fsp.readFile(logPath, "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(async () => {
  tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ng-api-debug-log-"));
  process.env.NODE_ENV = "test";
  process.env.NG_API_DEBUG_LOG = "true";
  process.env.NG_API_DEBUG_LOG_DIR = tempDir;
});

afterEach(async () => {
  restoreEnv();
  if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true });
});

describe("model API debug log", () => {
  it("writes full request and response data for non-streaming calls", async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "ok" } }],
            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          }),
        },
      },
    } as unknown as OpenAI;

    const result = await createChatCompletion({
      client,
      model: "mock-model",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.3,
      maxTokens: 123,
    });

    expect(result.message.content).toBe("ok");
    const entries = await readLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      providerScope: "model",
      stream: false,
      model: "mock-model",
      request: {
        model: "mock-model",
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.3,
        maxTokens: 123,
        stream: false,
      },
      response: {
        message: { role: "assistant", content: "ok" },
      },
      usage: {
        promptTokens: 3,
        completionTokens: 2,
        totalTokens: 5,
      },
    });
    expect(entries[0].id).toEqual(expect.any(String));
    expect(entries[0].createdAt).toEqual(expect.any(String));
    expect(entries[0].durationMs).toEqual(expect.any(Number));
  });

  it("writes accumulated content, reasoning, tool calls, and usage for streaming calls", async () => {
    async function* chunks() {
      yield { choices: [{ delta: { content: "你" } }] };
      yield { choices: [{ delta: { reasoning_content: "想" } }] };
      yield {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "tc1",
              type: "function",
              function: { name: "read_file", arguments: "{\"path\":\"a" },
            }],
          },
        }],
      };
      yield {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: ".md\"}" },
            }],
          },
        }],
      };
      yield { choices: [{ delta: { content: "好" } }] };
      yield { choices: [], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } };
    }
    const client = {
      chat: {
        completions: {
          create: async () => chunks(),
        },
      },
    } as unknown as OpenAI;

    const events = [];
    for await (const event of createChatCompletionStream({
      client,
      model: "mock-stream",
      messages: [{ role: "user", content: "write" }],
    })) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({ type: "done" });
    const entries = await readLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      providerScope: "model",
      stream: true,
      model: "mock-stream",
      request: {
        model: "mock-stream",
        messages: [{ role: "user", content: "write" }],
        stream: true,
      },
      response: {
        content: "你好",
        reasoning: "想",
        toolCalls: [{
          id: "tc1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"a.md\"}" },
        }],
      },
      usage: {
        promptTokens: 4,
        completionTokens: 3,
        totalTokens: 7,
      },
    });
  });

  it("writes error logs and rethrows the original error", async () => {
    const failure = new Error("provider down");
    failure.name = "ProviderError";
    const client = {
      chat: {
        completions: {
          create: async () => {
            throw failure;
          },
        },
      },
    } as unknown as OpenAI;

    await expect(createChatCompletion({
      client,
      model: "mock-error",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toBe(failure);

    const entries = await readLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      providerScope: "model",
      stream: false,
      model: "mock-error",
      error: {
        name: "ProviderError",
        message: "provider down",
      },
    });
  });

  it("does not write logs in production, test defaults, or when disabled", async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        },
      },
    } as unknown as OpenAI;

    process.env.NODE_ENV = "production";
    process.env.NG_API_DEBUG_LOG = "";
    await createChatCompletion({
      client,
      model: "mock",
      messages: [{ role: "user", content: "prod" }],
    });

    process.env.NODE_ENV = "test";
    delete process.env.NG_API_DEBUG_LOG;
    await createChatCompletion({
      client,
      model: "mock",
      messages: [{ role: "user", content: "test default" }],
    });

    process.env.NG_API_DEBUG_LOG = "false";
    await createChatCompletion({
      client,
      model: "mock",
      messages: [{ role: "user", content: "disabled" }],
    });

    await expect(fsp.stat(path.join(tempDir, "model-api-calls.jsonl"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("honors runtime admin settings in production", async () => {
    const dataRoot = path.join(tempDir, "data");
    await fsp.mkdir(path.join(dataRoot, "admin"), { recursive: true });
    await fsp.writeFile(
      path.join(dataRoot, "admin", "api-debug-log-settings.json"),
      `${JSON.stringify({ enabled: true, logDir: tempDir, updatedAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    process.env.NODE_ENV = "production";
    delete process.env.NG_API_DEBUG_LOG;
    delete process.env.NG_API_DEBUG_LOG_DIR;
    process.env.LG_DATA_DIR = dataRoot;

    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        },
      },
    } as unknown as OpenAI;

    await createChatCompletion({
      client,
      model: "mock-runtime",
      messages: [{ role: "user", content: "runtime" }],
    });

    const entries = await readLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      providerScope: "model",
      model: "mock-runtime",
      request: {
        messages: [{ role: "user", content: "runtime" }],
      },
    });
  });

  it("defaults to the workspace api-calls directory from nested app cwd", async () => {
    delete process.env.NG_API_DEBUG_LOG_DIR;
    const originalCwd = process.cwd();
    const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ng-api-debug-workspace-"));
    const nestedCwd = path.join(workspaceRoot, "apps", "lg");
    const logPath = path.join(workspaceRoot, "api-calls", "model-api-calls.jsonl");
    await fsp.writeFile(path.join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
    await fsp.mkdir(nestedCwd, { recursive: true });
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "root log" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        },
      },
    } as unknown as OpenAI;

    try {
      process.chdir(nestedCwd);
      await createChatCompletion({
        client,
        model: "mock-root",
        messages: [{ role: "user", content: "nested" }],
      });

      const raw = await fsp.readFile(logPath, "utf8");
      const entries = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        providerScope: "model",
        model: "mock-root",
        response: {
          message: { role: "assistant", content: "root log" },
        },
      });
    } finally {
      process.chdir(originalCwd);
      await fsp.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
