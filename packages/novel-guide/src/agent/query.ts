// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/query.ts
// Mechanism copied: call the model, execute requested tools, append tool
// results, and continue the same turn until the assistant stops or the turn
// budget is exhausted.

import type OpenAI from "openai";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createChatCompletionStream, type ModelTool, type ModelUsage } from "../model/deepseek.js";
import { findTool, runTool, toModelTool, type FileChange, type FileProposal, type ToolContext, type Tools } from "../tools/tool.js";
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
  proposals: FileProposal[];
}

export type QueryEvent =
  | { type: "model_start"; loop: number; maxLoops: number }
  | { type: "assistant_delta"; loop: number; text: string; accumulatedText: string }
  | { type: "reasoning_delta"; loop: number; text: string }
  | { type: "assistant_message"; loop: number; text: string }
  | { type: "usage_update"; loop: number; usage: ModelUsage; totalUsage: ModelUsage }
  | { type: "tool_call"; loop: number; name: string; argsPreview: string }
  | { type: "tool_result"; loop: number; name: string; ok: boolean; content: string; resultPreview: string; durationMs: number }
  | { type: "subagent_event"; loop: number; subagent: string; event: QueryEvent }
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

function previewArguments(value: string | undefined, maxLength = 240): string {
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function previewResult(value: string, maxLength = 360): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function previewLimitForTool(name: string): number {
  return name === "ask_user" ? 2000 : 240;
}

function resultPreviewLimitForTool(name: string): number {
  return name === "ask_user" ? 2000 : 360;
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
    proposals: [],
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
  const proposals: FileProposal[] = [];
  let repeatedSignature = "";
  let repeatedCount = 0;

  for (let loop = 0; loop < input.maxLoops; loop++) {
    throwIfAborted(input.signal);
    yield { type: "model_start", loop, maxLoops: input.maxLoops };
    let assistantMessage: ChatCompletion["choices"][number]["message"] | null = null;
    let loopUsage: ModelUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let loopText = "";

    const stream = collectStreamedCompletion({
      client: input.client,
      model: input.model,
      messages,
      tools: modelTools,
      signal: input.signal,
    });

    for await (const event of stream) {
      if (event.type === "assistant_delta") {
        loopText += event.text;
        yield { type: "assistant_delta", loop, text: event.text, accumulatedText: loopText };
      } else if (event.type === "reasoning_delta") {
        yield { type: "reasoning_delta", loop, text: event.text };
      } else if (event.type === "usage") {
        loopUsage = event.usage;
        yield { type: "usage_update", loop, usage: event.usage, totalUsage: addUsage(usage, event.usage) };
      } else if (event.type === "done") {
        assistantMessage = event.message;
        loopUsage = event.usage;
      }
    }

    if (!assistantMessage) {
      yield { type: "error", loop, message: "Model stream ended without a final assistant message." };
      assistantMessage = { role: "assistant", content: loopText, refusal: null };
    }

    usage = addUsage(usage, loopUsage);
    const completedAssistantMessage = assistantMessage;
    messages.push(completedAssistantMessage as ChatCompletionMessageParam);

    const content = typeof completedAssistantMessage.content === "string" ? completedAssistantMessage.content : "";
    if (content) {
      finalText = content;
      yield { type: "assistant_message", loop, text: content };
    }

    const toolCalls = completedAssistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      yield {
        type: "done",
        result: { messages, text: withFailureDisclosure(finalText, failedTools), usage, toolTrace, failedTools, fileChanges, proposals },
      };
      return;
    }

    const currentSignature = JSON.stringify(toolCalls.map((toolCall) => (
      toolCall.type === "function"
        ? { name: toolCall.function.name, arguments: toolCall.function.arguments }
        : { type: toolCall.type }
    )));
    if (!content && currentSignature === repeatedSignature) {
      repeatedCount += 1;
    } else {
      repeatedSignature = currentSignature;
      repeatedCount = 1;
    }
    if (repeatedCount >= 3) {
      const stopText = "Stopped because the model repeated the same tool request without producing new assistant text.";
      messages.push({ role: "assistant", content: stopText });
      failedTools.push(`query: ${stopText}`);
      yield { type: "error", loop, message: stopText };
      yield {
        type: "done",
        result: { messages, text: withFailureDisclosure(finalText || stopText, failedTools), usage, toolTrace, failedTools, fileChanges, proposals },
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
      yield { type: "tool_call", loop, name, argsPreview: previewArguments(toolCall.function.arguments, previewLimitForTool(name)) };
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
        yield { type: "tool_result", loop, name, ok: false, content, resultPreview: previewResult(content, resultPreviewLimitForTool(name)), durationMs: 0 };
        continue;
      }
      const startedAt = Date.now();
      const result = await runTool(tool, parseToolArguments(toolCall.function.arguments), input.toolContext);
      const durationMs = Date.now() - startedAt;
      toolTrace.push(`${name}: ${result.ok ? "ok" : "failed"}`);
      if (!result.ok) failedTools.push(`${name}: ${result.content}`);
      if (result.ok && Array.isArray(result.metadata?.fileChanges)) {
        fileChanges.push(...result.metadata.fileChanges);
      }
      if (result.ok && Array.isArray(result.metadata?.proposals)) {
        proposals.push(...result.metadata.proposals);
      }
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.content,
      });
      yield {
        type: "tool_result",
        loop,
        name,
        ok: result.ok,
        content: result.content,
        resultPreview: previewResult(result.content, resultPreviewLimitForTool(name)),
        durationMs,
      };
    }
  }

  const stopText = `Stopped after ${input.maxLoops} tool loop(s) to avoid an infinite loop.`;
  messages.push({ role: "assistant", content: stopText });
  failedTools.push(`query: ${stopText}`);
  yield {
    type: "done",
  result: { messages, text: withFailureDisclosure(finalText || stopText, failedTools), usage, toolTrace, failedTools, fileChanges, proposals },
  };
}

function collectStreamedCompletion(input: Parameters<typeof createChatCompletionStream>[0]) {
  return createChatCompletionStream(input);
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
