export { AgentEngine } from "./agent/engine.js";
export { loadSession, saveSession, type SessionState } from "./agent/session.js";
export { initNovelWorkspace } from "./novel/init.js";
export type { FileChange } from "./tools/tool.js";
export {
  isInside,
  normalizeSlashPath,
  relativeTo,
  resolveInside,
} from "./utils/paths.js";
export {
  createChatCompletion,
  createDeepSeekClient,
  createOpenAICompatibleClient,
  getDeepSeekConfig,
  getOpenAICompatibleConfig,
  type DeepSeekConfig,
  type ModelMessage,
  type ModelResponse,
  type ModelTool,
  type ModelUsage,
  type OpenAICompatibleConfig,
} from "./model/deepseek.js";
