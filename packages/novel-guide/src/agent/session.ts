import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface SessionState {
  id: string;
  cwd: string;
  messages: ChatCompletionMessageParam[];
  compaction?: SessionCompactionState;
  updatedAt: string;
}

export interface SessionCompactionState {
  lastCompactedAt: string;
  originalMessageCount: number;
  compactedMessageCount: number;
}

export function createSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sessionPath(cwd: string, id: string): string {
  return path.join(cwd, ".novel-guide", "sessions", `${id}.json`);
}

export async function saveSession(state: SessionState): Promise<void> {
  const filePath = sessionPath(state.cwd, state.id);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

export async function loadSession(cwd: string, id: string): Promise<SessionState | null> {
  try {
    const raw = await readFile(sessionPath(cwd, id), "utf8");
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}
