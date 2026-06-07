// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/query.ts
// Mechanism copied: call the model, execute requested tools, append tool
// results, and continue the same turn until the assistant stops or the turn
// budget is exhausted.

import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createChatCompletion, type ModelTool, type ModelUsage } from "../model/deepseek.js";
import { findTool, runTool, toModelTool, type FileChange, type ToolContext, type Tools } from "../tools/tool.js";
import { safeJsonParse } from "../utils/json.js";

export interface QueryInput {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: Tools;
  toolContext: ToolContext;
  maxLoops: number;
  signal?: AbortSignal;
}

export interface QueryResult {
  messages: ChatCompletionMessageParam[];
  text: string;
  usage: ModelUsage;
  toolTrace: string[];
  failedTools: string[];
  fileChanges: FileChange[];
}

export type QueryEvent =
  | { type: "model_start"; loop: number }
  | { type: "assistant_message"; loop: number; text: string }
  | { type: "tool_call"; loop: number; name: string; argsPreview: string }
  | { type: "tool_result"; loop: number; name: string; ok: boolean; content: string }
  | { type: "error"; loop: number; message: string }
  | { type: "done"; result: QueryResult };

function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function parseToolArguments(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const parsed = safeJsonParse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function previewArguments(value: string | undefined): string {
  if (!value) return "";
  return value.length > 240 ? `${value.slice(0, 240)}...` : value;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  throw error;
}

export async function query(input: QueryInput): Promise<QueryResult> {
  let result: QueryResult | null = null;
  for await (const event of queryEvents(input)) {
    if (event.type === "done") result = event.result;
  }
  if (result) return result;

  const stopText = "Query ended without a final result.";
  return {
    messages: input.messages,
    text: stopText,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    toolTrace: [],
    failedTools: [`query: ${stopText}`],
    fileChanges: [],
  };
}

export async function* queryEvents(input: QueryInput): AsyncGenerator<QueryEvent> {
  let messages = [...input.messages];
  const modelTools: ModelTool[] = input.tools.map(toModelTool);
  let finalText = "";
  let usage: ModelUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolTrace: string[] = [];
  const failedTools: string[] = [];
  const fileChanges: FileChange[] = [];

  for (let loop = 0; loop < input.maxLoops; loop++) {
    throwIfAborted(input.signal);
    yield { type: "model_start", loop };
    const response = await createChatCompletion({
      client: input.client,
      model: input.model,
      messages,
      tools: modelTools,
      signal: input.signal,
    });
    usage = addUsage(usage, response.usage);
    const assistantMessage = response.message;
    messages.push(assistantMessage as ChatCompletionMessageParam);

    const content = typeof assistantMessage.content === "string" ? assistantMessage.content : "";
    if (content) {
      finalText = content;
      yield { type: "assistant_message", loop, text: content };
    }

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      yield {
        type: "done",
        result: { messages, text: withFailureDisclosure(finalText, failedTools), usage, toolTrace, failedTools, fileChanges },
      };
      return;
    }

    for (const toolCall of toolCalls) {
      throwIfAborted(input.signal);
      if (toolCall.type !== "function") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Unsupported tool call type: ${toolCall.type}`,
        });
        continue;
      }
      const name = toolCall.function.name;
      yield { type: "tool_call", loop, name, argsPreview: previewArguments(toolCall.function.arguments) };
      const tool = findTool(input.tools, name);
      if (!tool) {
        const content = `Unknown tool: ${name}`;
        toolTrace.push(`${name}: missing`);
        failedTools.push(`${name}: ${content}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content,
        });
        yield { type: "tool_result", loop, name, ok: false, content };
        continue;
      }
      const result = await runTool(tool, parseToolArguments(toolCall.function.arguments), input.toolContext);
      toolTrace.push(`${name}: ${result.ok ? "ok" : "failed"}`);
      if (!result.ok) failedTools.push(`${name}: ${result.content}`);
      if (result.ok && Array.isArray(result.metadata?.fileChanges)) {
        fileChanges.push(...result.metadata.fileChanges);
      }
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.content,
      });
      yield { type: "tool_result", loop, name, ok: result.ok, content: result.content };
    }
  }

  const stopText = `Stopped after ${input.maxLoops} tool loop(s) to avoid an infinite loop.`;
  messages.push({ role: "assistant", content: stopText });
  failedTools.push(`query: ${stopText}`);
  yield {
    type: "done",
    result: { messages, text: withFailureDisclosure(finalText || stopText, failedTools), usage, toolTrace, failedTools, fileChanges },
  };
}

function withFailureDisclosure(text: string, failedTools: string[]): string {
  if (failedTools.length === 0) return text;
  return [
    text,
    "",
    "注意：本轮有工具调用失败，以上结果不能视为全部完成。失败摘要：",
    ...failedTools.map((item) => `- ${item}`),
  ].join("\n");
}
