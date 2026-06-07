export { AgentEngine, type EngineStreamEvent } from "./agent/engine.js";
export { loadSession, saveSession, type SessionCompactionState, type SessionState } from "./agent/session.js";
export { type QueryEvent } from "./agent/query.js";
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
