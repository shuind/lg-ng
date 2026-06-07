import { spawn } from "node:child_process";
import type { Tool } from "./tool.js";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isDangerousCommand(command: string): boolean {
  const normalized = command.toLowerCase().replace(/\s+/g, " ").trim();
  const dangerousPatterns = [
    /\brm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\b/,
    /\bremove-item\b.*\b-recurse\b/,
    /\brmdir\b.*\s\/s\b/,
    /\bdel\b.*\s\/s\b/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+clean\b.*\s-f/,
    /\bgit\s+push\b.*(--force|-f)\b/,
    /\bformat\b/,
    /\bdiskpart\b/,
    /\bmkfs(?:\.[a-z0-9]+)?\b/,
  ];
  return dangerousPatterns.some((pattern) => pattern.test(normalized));
}

export const ShellTool: Tool = {
  name: "shell",
  description: "Run a shell command in the workspace. Dangerous destructive commands require confirmation.",
  readonly: false,
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout_ms: { type: "number" },
    },
    required: ["command"],
  },
  requiresPermission(input) {
    const command = str(input.command);
    if (!isDangerousCommand(command)) return { allowed: true };
    return {
      allowed: false,
      confirmationRequired: true,
      forceConfirmation: true,
      reason: `Dangerous shell command requested: ${command}`,
    };
  },
  async execute(input, context) {
    const command = str(input.command);
    const timeoutMs = typeof input.timeout_ms === "number" ? Math.max(1000, Math.floor(input.timeout_ms)) : 30000;
    const shell = process.platform === "win32" ? "powershell.exe" : "sh";
    const args = process.platform === "win32"
      ? ["-NoLogo", "-NoProfile", "-Command", command]
      : ["-lc", command];

    return await new Promise((resolve) => {
      const child = spawn(shell, args, { cwd: context.cwd, windowsHide: true });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (result: { ok: boolean; content: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        context.signal?.removeEventListener("abort", abort);
        resolve(result);
      };
      const abort = () => {
        child.kill();
        finish({ ok: false, content: `Command aborted.\n${stdout}\n${stderr}` });
      };
      const timer = setTimeout(() => {
        child.kill();
        finish({ ok: false, content: `Command timed out after ${timeoutMs}ms.\n${stdout}\n${stderr}` });
      }, timeoutMs);
      if (context.signal?.aborted) {
        abort();
        return;
      }
      context.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (code) => {
        finish({
          ok: code === 0,
          content: `Exit code: ${code}\nSTDOUT:\n${stdout || "(empty)"}\nSTDERR:\n${stderr || "(empty)"}`,
        });
      });
      child.on("error", (error) => {
        finish({ ok: false, content: `Failed to start command: ${error.message}` });
      });
    });
  },
};

export function allShellTools(): Tool[] {
  return [ShellTool];
}
