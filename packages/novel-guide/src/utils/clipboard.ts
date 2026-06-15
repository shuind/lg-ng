import { spawn } from "node:child_process";
import process from "node:process";

export interface ClipboardResult {
  ok: boolean;
  method?: "clip" | "pbcopy" | "wl-copy" | "xclip" | "xsel";
  error?: string;
}

export async function copyTextToClipboard(text: string): Promise<ClipboardResult> {
  const candidates = clipboardCandidates();
  const errors: string[] = [];
  for (const candidate of candidates) {
    const result = await tryClipboardCommand(candidate.command, candidate.args, text);
    if (result.ok) return { ok: true, method: candidate.method };
    errors.push(`${candidate.method}: ${result.error}`);
  }
  return { ok: false, error: errors.join("; ") || "no clipboard command available" };
}

function clipboardCandidates(): Array<{ method: NonNullable<ClipboardResult["method"]>; command: string; args: string[] }> {
  if (process.platform === "win32") return [{ method: "clip", command: "clip", args: [] }];
  if (process.platform === "darwin") return [{ method: "pbcopy", command: "pbcopy", args: [] }];
  return [
    { method: "wl-copy", command: "wl-copy", args: [] },
    { method: "xclip", command: "xclip", args: ["-selection", "clipboard"] },
    { method: "xsel", command: "xsel", args: ["--clipboard", "--input"] },
  ];
}

function tryClipboardCommand(command: string, args: string[], text: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ ok: false, error: error.message }));
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: stderr.trim() || `exit ${code}` });
    });
    child.stdin?.end(text);
  });
}
