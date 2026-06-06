import { spawn } from "node:child_process";
import type { Tool } from "./tool.js";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const ShellTool: Tool = {
  name: "shell",
  description: "Run a shell command in the workspace. Requires confirmation.",
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
    return {
      allowed: false,
      confirmationRequired: true,
      reason: `Shell command requested: ${str(input.command)}`,
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
      const timer = setTimeout(() => {
        child.kill();
        resolve({ ok: false, content: `Command timed out after ${timeoutMs}ms.\n${stdout}\n${stderr}` });
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          content: `Exit code: ${code}\nSTDOUT:\n${stdout || "(empty)"}\nSTDERR:\n${stderr || "(empty)"}`,
        });
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ ok: false, content: `Failed to start command: ${error.message}` });
      });
    });
  },
};

export function allShellTools(): Tool[] {
  return [ShellTool];
}
