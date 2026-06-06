import { z } from "zod"

interface LlmConfig {
  provider: "mimo" | "deepseek"
  apiKey: string
  baseUrl: string
  model: string
}

export function getConfig(): LlmConfig | null {
  const provider = (process.env.LLM_PROVIDER ?? "mimo").toLowerCase()

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) return null
    return {
      provider: "deepseek",
      apiKey,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    }
  }

  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) return null
  return {
    provider: "mimo",
    apiKey,
    baseUrl: process.env.MIMO_BASE_URL ?? "https://api.mimo-v2.com/v1",
    model: process.env.MIMO_MODEL ?? "mimo-v2.5-pro",
  }
}

export function isLlmEnabled(): boolean {
  return getConfig() !== null
}

export function getLlmProvider(): string {
  return getConfig()?.provider ?? "none"
}

const LlmActionSchema = z.union([
  z.object({
    type: z.literal("gender_change"),
    character: z.string().min(1),
    target: z.string().min(1),
  }),
  z.object({
    type: z.literal("relationship_change"),
    charA: z.string().min(1),
    charB: z.string().min(1),
    relationship: z.string().min(1),
  }),
  z.object({
    type: z.literal("character_create"),
    name: z.string().min(1),
    fields: z.object({
      gender: z.string().optional(),
      age: z.string().optional(),
      identity: z.string().optional(),
      summary: z.string().optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal("character_update"),
    character: z.string().min(1),
    field: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("world_update"),
    fileHint: z.string().min(1),
    section: z.string().optional(),
    content: z.string().min(1),
  }),
  z.object({
    type: z.literal("chapter_check"),
    chapterHint: z.string().min(1),
    target: z.string().optional(),
    checkGoal: z.string().min(1),
  }),
  z.object({
    type: z.literal("foreshadowing_add"),
    name: z.string().min(1),
    content: z.string().min(1),
    chapter: z.string().optional(),
  }),
  z.object({
    type: z.literal("foreshadowing_payoff"),
    name: z.string().min(1),
    chapter: z.string().optional(),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("event_record"),
    title: z.string().min(1),
    content: z.string().min(1),
    importance: z.string().optional(),
  }),
  z.object({
    type: z.literal("timeline_event_add"),
    time: z.string().min(1),
    event: z.string().min(1),
    characters: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("character_position_update"),
    character: z.string().min(1),
    position: z.string().min(1),
    chapter: z.string().optional(),
  }),
  z.object({
    type: z.literal("chapter_summary_update"),
    chapter: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({
    type: z.literal("outline_update"),
    outlineLevel: z.enum(["volume", "chapter"]),
    title: z.string().min(1),
    content: z.string().min(1),
    volume: z.string().optional(),
    chapter: z.string().optional(),
  }),
  z.object({
    type: z.literal("reader_knowledge_update"),
    item: z.string().min(1),
    readerKnows: z.boolean(),
    characterKnows: z.string().optional(),
  }),
  z.object({
    type: z.literal("emotion_debt_add"),
    promise: z.string().min(1),
    chapter: z.string().optional(),
  }),
  z.object({
    type: z.literal("emotion_debt_payoff"),
    promise: z.string().min(1),
    chapter: z.string().optional(),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("banned_pattern_add"),
    pattern: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("quality_rule_update"),
    rule: z.string().min(1),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("agent_rule_update"),
    rule: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("system_check"),
    checkGoal: z.string().min(1),
    checkType: z.enum(["foreshadowing", "timeline", "character_position", "reader_experience", "quality"]).optional(),
    targets: z.array(z.string()).optional(),
  }),
])

export type LlmAction = z.infer<typeof LlmActionSchema>

interface ChatResponse {
  content: string
}

export async function callChatCompletion(
  config: LlmConfig,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<ChatResponse> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "api-key": config.apiKey,
  }
  const bodyObj: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options?.temperature ?? 0.1,
    max_tokens: options?.maxTokens ?? 2000,
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const message = data.choices?.[0]?.message
  const content = typeof message?.content === "string" ? message.content : ""
  return { content }
}
