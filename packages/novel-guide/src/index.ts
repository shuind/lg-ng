export {
  AgentEngine,
  type EngineContextWindowComponents,
  type EngineContextWindowLevel,
  type EngineContextWindowState,
  type EngineStreamEvent,
} from "./agent/engine.js";
export {
  DRAFT_POLICY_RULES,
  DRAFT_POLICY_TOOL_HINT,
  FILE_TRUTH_RULES,
  LG_CONTENT_DIRECTORY_RULES,
  LG_LEGACY_DIRECTORY_RULES,
  REVIEW_AGENT_BASE_PROMPT,
  REVIEW_AGENT_JSON_SCHEMA,
  REVIEW_SEMANTICS_RULES,
  SEARCH_CANON_TOOL_HINT,
  WRITE_REPORTING_RULES,
} from "./prompts/novelRules.js";
export {
  loadSession,
  saveSession,
  type CompactionBoundary,
  type CompactionBoundaryStrategy,
  type CompactionBoundaryTrigger,
  type CompactionMessageRange,
  type DroppedCompactionMessageGroup,
  type SessionCompactionState,
  type SessionState,
} from "./agent/session.js";
export { type QueryEvent } from "./agent/query.js";
export { initNovelWorkspace } from "./novel/init.js";
export type { FileChange, FileProposal } from "./tools/tool.js";
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
  type ModelStreamEvent,
  type ModelTool,
  type ModelUsage,
  type OpenAICompatibleConfig,
  createChatCompletionStream,
} from "./model/deepseek.js";
