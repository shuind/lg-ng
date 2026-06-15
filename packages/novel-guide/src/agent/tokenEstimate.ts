import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export function estimateTextTokens(text: string): number {
  const cjkChars = (text.match(/[㐀-鿿豈-﫿]/g) ?? []).length;
  const otherChars = Math.max(0, text.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars / 1.7 + otherChars / 3.5));
}

export function estimateMessagesTokens(messages: ChatCompletionMessageParam[]): number {
  return messages.reduce((sum, message) => sum + estimateTextTokens(renderMessage(message)) + 8, 0);
}

function renderMessage(message: ChatCompletionMessageParam): string {
  const role = "role" in message ? message.role : "unknown";
  const content = stringifyMessageContent(message.content);
  const toolCalls = "tool_calls" in message && message.tool_calls
    ? `\nTool calls: ${JSON.stringify(message.tool_calls)}`
    : "";
  return `[${role}]\n${content}${toolCalls}`;
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
      return part.text;
    }
    return JSON.stringify(part);
  }).join("");
}
