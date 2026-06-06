import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

export type ModelMessage = ChatCompletionMessageParam;
export type ModelTool = ChatCompletionTool;

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface OpenAICompatibleConfig extends DeepSeekConfig {
  provider: "deepseek" | "mimo";
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelResponse {
  message: ChatCompletion["choices"][number]["message"];
  usage: ModelUsage;
}

export function getDeepSeekConfig(): DeepSeekConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.NG_MODEL ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
  };
}

export function getOpenAICompatibleConfig(): OpenAICompatibleConfig | null {
  const provider = (process.env.NG_PROVIDER ?? process.env.LLM_PROVIDER ?? "deepseek").toLowerCase();

  if (provider === "mimo") {
    const apiKey = process.env.MIMO_API_KEY;
    if (!apiKey) return null;
    return {
      provider: "mimo",
      apiKey,
      baseUrl: process.env.MIMO_BASE_URL ?? "https://api.mimo-v2.com/v1",
      model: process.env.NG_MODEL ?? process.env.MIMO_MODEL ?? "mimo-v2.5-pro",
    };
  }

  const deepseek = getDeepSeekConfig();
  return deepseek ? { provider: "deepseek", ...deepseek } : null;
}

export function createDeepSeekClient(config: DeepSeekConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

export function createOpenAICompatibleClient(config: DeepSeekConfig): OpenAI {
  return createDeepSeekClient(config);
}

export async function createChatCompletion(input: {
  client: OpenAI;
  model: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ModelResponse> {
  const response = await input.client.chat.completions.create({
    model: input.model,
    messages: input.messages,
    tools: input.tools,
    tool_choice: input.tools?.length ? "auto" : undefined,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 4096,
    stream: false,
  }) as ChatCompletion;
  const usage = response.usage;
  return {
    message: response.choices[0]?.message ?? { role: "assistant", content: "" },
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}
