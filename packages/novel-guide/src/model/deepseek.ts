import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

export type ModelMessage = ChatCompletionMessageParam;
export type ModelTool = ChatCompletionTool;

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface OpenAICompatibleConfig extends DeepSeekConfig {
  provider: string;
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
  rawUsage?: ModelRawUsage;
}

export interface ModelRawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface ModelResponse {
  message: ChatCompletion["choices"][number]["message"];
  usage: ModelUsage;
}

export type ModelStreamEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_calls_final"; toolCalls: ChatCompletionMessageToolCall[] }
  | { type: "usage"; usage: ModelUsage }
  | { type: "done"; message: ChatCompletion["choices"][number]["message"]; usage: ModelUsage };

export function getDeepSeekConfig(): DeepSeekConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.NG_MODEL ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
  };
}

function getGenericOpenAICompatibleConfig(): OpenAICompatibleConfig | null {
  const apiKey = process.env.NG_API_KEY;
  const baseUrl = process.env.NG_BASE_URL;
  const model = process.env.NG_MODEL;
  if (!apiKey || !baseUrl || !model) return null;
  return {
    provider: (process.env.NG_PROVIDER ?? process.env.LLM_PROVIDER ?? "custom").toLowerCase(),
    apiKey,
    baseUrl,
    model,
  };
}

function getMimoConfig(): OpenAICompatibleConfig | null {
  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) return null;
  return {
    provider: "mimo",
    apiKey,
    baseUrl: process.env.MIMO_BASE_URL ?? "https://api.mimo-v2.com/v1",
    model: process.env.NG_MODEL ?? process.env.MIMO_MODEL ?? "mimo-v2.5-pro",
  };
}

function getClaudeRelayConfig(): OpenAICompatibleConfig | null {
  const apiKey = process.env.CLAUDE_RELAY_API_KEY ?? process.env.CLAUDE_API_KEY;
  const baseUrl = process.env.CLAUDE_RELAY_BASE_URL ?? process.env.CLAUDE_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  return {
    provider: "claude-relay",
    apiKey,
    baseUrl,
    model: process.env.NG_MODEL ?? process.env.CLAUDE_RELAY_MODEL ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
  };
}

export function getOpenAICompatibleConfig(): OpenAICompatibleConfig | null {
  const provider = (process.env.NG_PROVIDER ?? process.env.LLM_PROVIDER)?.toLowerCase();

  const generic = getGenericOpenAICompatibleConfig();
  if (generic) return generic;

  if (provider === "mimo") {
    return getMimoConfig();
  }

  if (provider === "claude-relay" || provider === "claude") {
    return getClaudeRelayConfig();
  }

  const deepseek = getDeepSeekConfig();
  if (provider === "deepseek") {
    return deepseek ? { provider: "deepseek", ...deepseek } : null;
  }

  if (provider) {
    return null;
  }

  if (deepseek) {
    return { provider: "deepseek", ...deepseek };
  }

  return getMimoConfig();
}

export function createDeepSeekClient(config: DeepSeekConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

export function createOpenAICompatibleClient(config: OpenAICompatibleConfig): OpenAI {
  return createDeepSeekClient(config);
}

export async function createChatCompletion(input: {
  client: OpenAI;
  model: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<ModelResponse> {
  const response = await input.client.chat.completions.create({
    model: input.model,
    messages: input.messages,
    tools: input.tools,
    tool_choice: input.tools?.length ? "auto" : undefined,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 4096,
    stream: false,
  }, {
    ...(input.timeoutMs ? { timeout: input.timeoutMs } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  }) as ChatCompletion;
  const usage = response.usage;
  const normalizedUsage = normalizeUsage(usage);
  return {
    message: response.choices[0]?.message ?? { role: "assistant", content: "" },
    usage: normalizedUsage,
  };
}

type StreamToolCallPart = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeUsage(usage: ChatCompletion["usage"] | ChatCompletionChunk["usage"] | null | undefined): ModelUsage {
  const raw = usage as ({
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  } | null | undefined);
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
    promptCacheHitTokens: raw?.prompt_cache_hit_tokens ?? 0,
    promptCacheMissTokens: raw?.prompt_cache_miss_tokens ?? usage?.prompt_tokens ?? 0,
    rawUsage: usage
      ? {
          prompt_tokens: numberOrUndefined(usage.prompt_tokens),
          completion_tokens: numberOrUndefined(usage.completion_tokens),
          total_tokens: numberOrUndefined(usage.total_tokens),
          prompt_cache_hit_tokens: numberOrUndefined(raw?.prompt_cache_hit_tokens),
          prompt_cache_miss_tokens: numberOrUndefined(raw?.prompt_cache_miss_tokens),
          completion_tokens_details: raw?.completion_tokens_details
            ? {
                reasoning_tokens: numberOrUndefined(raw.completion_tokens_details.reasoning_tokens),
              }
            : undefined,
        }
      : undefined,
  };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<ChatCompletionChunk> {
  return Boolean(value && typeof value === "object" && Symbol.asyncIterator in value);
}

function getReasoningDelta(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const record = delta as Record<string, unknown>;
  const reasoning = record.reasoning_content ?? record.reasoning ?? record.reasoning_delta;
  return typeof reasoning === "string" ? reasoning : "";
}

function mergeToolCallDelta(
  current: Map<number, StreamToolCallPart>,
  index: number,
  delta: StreamToolCallPart,
): void {
  const existing = current.get(index) ?? {};
  const nextFunction = {
    ...existing.function,
    ...delta.function,
    arguments: `${existing.function?.arguments ?? ""}${delta.function?.arguments ?? ""}`,
  };
  current.set(index, {
    ...existing,
    ...delta,
    function: nextFunction,
  });
}

function finalizeToolCalls(parts: Map<number, StreamToolCallPart>): ChatCompletionMessageToolCall[] {
  return [...parts.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, part], index): ChatCompletionMessageToolCall[] => {
      const name = part.function?.name;
      if (!name) return [];
      return [{
        id: part.id ?? `tool-call-${index}`,
        type: "function",
        function: {
          name,
          arguments: part.function?.arguments ?? "",
        },
      } as ChatCompletionMessageToolCall];
    });
}

export async function* createChatCompletionStream(input: {
  client: OpenAI;
  model: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): AsyncGenerator<ModelStreamEvent> {
  const response = await createStreamingResponse(input);

  if (!isAsyncIterable(response)) {
    const completion = response as ChatCompletion;
    const message = completion.choices[0]?.message ?? { role: "assistant", content: "", refusal: null };
    const usage = normalizeUsage(completion.usage);
    const content = typeof message.content === "string" ? message.content : "";
    if (content) yield { type: "assistant_delta", text: content };
    if (message.tool_calls?.length) yield { type: "tool_calls_final", toolCalls: message.tool_calls };
    yield { type: "usage", usage };
    yield { type: "done", message, usage };
    return;
  }

  let content = "";
  let usage: ModelUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolCallParts = new Map<number, StreamToolCallPart>();

  for await (const chunk of response) {
    if (chunk.usage) {
      usage = normalizeUsage(chunk.usage);
      yield { type: "usage", usage };
    }

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      const text = typeof delta?.content === "string" ? delta.content : "";
      if (text) {
        content += text;
        yield { type: "assistant_delta", text };
      }

      const reasoning = getReasoningDelta(delta);
      if (reasoning) yield { type: "reasoning_delta", text: reasoning };

      for (const toolCall of delta?.tool_calls ?? []) {
        if (typeof toolCall.index !== "number") continue;
        mergeToolCallDelta(toolCallParts, toolCall.index, toolCall as StreamToolCallPart);
      }
    }
  }

  const toolCalls = finalizeToolCalls(toolCallParts);
  if (toolCalls.length > 0) yield { type: "tool_calls_final", toolCalls };
  const message: ChatCompletion["choices"][number]["message"] = {
    role: "assistant",
    content,
    refusal: null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
  yield { type: "done", message, usage };
}

async function createStreamingResponse(input: {
  client: OpenAI;
  model: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const requestOptions = {
    ...(input.timeoutMs ? { timeout: input.timeoutMs } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  };
  const base = {
    model: input.model,
    messages: input.messages,
    tools: input.tools,
    tool_choice: input.tools?.length ? "auto" as const : undefined,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 4096,
    stream: true as const,
  };
  try {
    return await input.client.chat.completions.create({
      ...base,
      stream_options: { include_usage: true },
    }, requestOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("stream_options") && !message.includes("include_usage") && !message.includes("unrecognized")) {
      throw error;
    }
    return await input.client.chat.completions.create(base, requestOptions);
  }
}
