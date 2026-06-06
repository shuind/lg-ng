import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { query } from "../src/agent/query.js";
import type { Tool } from "../src/tools/tool.js";

function mockClient(): OpenAI {
  let call = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          call += 1;
          if (call === 1) {
            return {
              choices: [{
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [{
                    id: "tc1",
                    type: "function",
                    function: { name: "read_file", arguments: "{\"path\":\"a.md\"}" },
                  }],
                },
              }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          }
          if (call === 2) {
            return {
              choices: [{
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [{
                    id: "tc2",
                    type: "function",
                    function: { name: "grep", arguments: "{\"pattern\":\"林衍\"}" },
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
}

const tools: Tool[] = [
  {
    name: "read_file",
    description: "read",
    readonly: true,
    parameters: { type: "object", properties: {} },
    requiresPermission: () => ({ allowed: true }),
    execute: async () => ({ ok: true, content: "林衍醒来。" }),
  },
  {
    name: "grep",
    description: "grep",
    readonly: true,
    parameters: { type: "object", properties: {} },
    requiresPermission: () => ({ allowed: true }),
    execute: async () => ({ ok: true, content: "a.md:1: 林衍醒来。" }),
  },
];

describe("query loop", () => {
  it("continues through multiple tool calls", async () => {
    const result = await query({
      client: mockClient(),
      model: "mock",
      messages: [{ role: "user", content: "check" }],
      tools,
      toolContext: { cwd: process.cwd() },
      maxLoops: 5,
    });
    expect(result.text).toBe("done");
    expect(result.toolTrace).toEqual(["read_file: ok", "grep: ok"]);
  });

  it("discloses failed tools in final text", async () => {
    let call = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            call += 1;
            if (call === 1) {
              return {
                choices: [{
                  message: {
                    role: "assistant",
                    content: "",
                    tool_calls: [{
                      id: "tc1",
                      type: "function",
                      function: { name: "read_file", arguments: "{\"path\":\"missing.md\"}" },
                    }],
                  },
                }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              };
            }
            return {
              choices: [{ message: { role: "assistant", content: "归档完成" } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          },
        },
      },
    } as unknown as OpenAI;
    const failingTool: Tool = {
      name: "read_file",
      description: "read",
      readonly: true,
      parameters: { type: "object", properties: {} },
      requiresPermission: () => ({ allowed: true }),
      execute: async () => ({ ok: false, content: "missing file" }),
    };
    const result = await query({
      client,
      model: "mock",
      messages: [{ role: "user", content: "check" }],
      tools: [failingTool],
      toolContext: { cwd: process.cwd() },
      maxLoops: 5,
    });
    expect(result.text).toContain("工具调用失败");
    expect(result.text).toContain("read_file: missing file");
    expect(result.failedTools).toEqual(["read_file: missing file"]);
  });
});
