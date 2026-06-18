import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { ModelUsage } from "./deepseek.js";

const DEBUG_LOG_DIR = "api-calls";
const DEBUG_LOG_FILE = "model-api-calls.jsonl";
const API_DEBUG_LOG_SETTINGS_FILE = "api-debug-log-settings.json";

export interface ModelDebugLogRequest {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stream: boolean;
}

export interface ModelDebugLogResponse {
  message?: ChatCompletion["choices"][number]["message"];
  content?: string;
  reasoning?: string;
  toolCalls?: ChatCompletionMessageToolCall[];
}

interface ModelDebugLogInput {
  request: ModelDebugLogRequest;
  response?: ModelDebugLogResponse;
  error?: unknown;
  usage?: ModelUsage;
  durationMs: number;
}

type RuntimeApiDebugLogSettings = {
  enabled?: boolean;
  logDir?: string;
};

function readRuntimeApiDebugLogSettings(): RuntimeApiDebugLogSettings {
  try {
    const raw = JSON.parse(readFileSync(runtimeSettingsPath(), "utf8")) as Partial<RuntimeApiDebugLogSettings>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return {
      ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
      ...(typeof raw.logDir === "string" && raw.logDir.trim() ? { logDir: raw.logDir.trim() } : {}),
    };
  } catch {
    return {};
  }
}

function runtimeDataRoot(): string {
  if (process.env.LG_DATA_DIR) return path.resolve(process.env.LG_DATA_DIR);
  return path.join(findWorkspaceRoot(process.cwd()), ".lg-data");
}

function runtimeSettingsPath(): string {
  return path.join(runtimeDataRoot(), "admin", API_DEBUG_LOG_SETTINGS_FILE);
}

function isDebugLogEnabled(runtimeSettings = readRuntimeApiDebugLogSettings()): boolean {
  // Explicit opt-in wins, even in production. This log captures full prompts and
  // responses, so only enable it temporarily (e.g. to compare server vs. local).
  if (process.env.NG_API_DEBUG_LOG === "true") return true;
  if (typeof runtimeSettings.enabled === "boolean") return runtimeSettings.enabled;
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.NODE_ENV === "test") return false;
  return process.env.NG_API_DEBUG_LOG !== "false";
}

function debugLogDir(runtimeSettings = readRuntimeApiDebugLogSettings()): string {
  if (process.env.NG_API_DEBUG_LOG_DIR) return path.resolve(process.env.NG_API_DEBUG_LOG_DIR);
  if (runtimeSettings.logDir) return path.resolve(runtimeSettings.logDir);
  if (process.env.LG_DATA_DIR) return path.join(runtimeDataRoot(), DEBUG_LOG_DIR);
  return path.join(findWorkspaceRoot(process.cwd()), DEBUG_LOG_DIR);
}

function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    if (
      existsSync(path.join(current, "pnpm-workspace.yaml"))
      || existsSync(path.join(current, ".git"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

function serializeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}

export async function recordModelApiDebugLog(input: ModelDebugLogInput): Promise<void> {
  const runtimeSettings = readRuntimeApiDebugLogSettings();
  if (!isDebugLogEnabled(runtimeSettings)) return;

  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    providerScope: "model" as const,
    stream: input.request.stream,
    model: input.request.model,
    request: input.request,
    ...(input.response ? { response: input.response } : {}),
    ...(input.error ? { error: serializeError(input.error) } : {}),
    ...(input.usage ? { usage: input.usage } : {}),
    durationMs: input.durationMs,
  };

  try {
    const filePath = path.join(debugLogDir(runtimeSettings), DEBUG_LOG_FILE);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.warn("[model-api-debug-log] Failed to write model API debug log:", error);
  }
}
