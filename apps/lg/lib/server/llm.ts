import {
  createChatCompletion,
  createOpenAICompatibleClient,
  getOpenAICompatibleConfig,
  type ModelMessage,
  type OpenAICompatibleConfig,
} from "novel-guide"

type LlmConfig = OpenAICompatibleConfig

type ChatMessage = {
  role: string
  content: string
}

interface ChatResponse {
  content: string
}

export function getConfig(): LlmConfig | null {
  return getOpenAICompatibleConfig()
}

export function isLlmEnabled(): boolean {
  return getConfig() !== null
}

export function getLlmProvider(): string {
  return getConfig()?.provider ?? "none"
}

export async function callChatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<ChatResponse> {
  const response = await createChatCompletion({
    client: createOpenAICompatibleClient(config),
    model: config.model,
    messages: toModelMessages(messages),
    temperature: options?.temperature ?? 0.1,
    maxTokens: options?.maxTokens ?? 2000,
    timeoutMs: 60000,
  })

  return { content: stringifyContent(response.message.content) }
}

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((message) => ({
    role: toModelRole(message.role),
    content: message.content,
  }))
}

function toModelRole(role: string): "system" | "user" | "assistant" {
  if (role === "system" || role === "assistant") return role
  return "user"
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text
      }
      return ""
    })
    .join("")
}
