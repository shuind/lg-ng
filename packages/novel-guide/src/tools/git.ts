import { spawn } from "node:child_process";
import type { Tool } from "./tool.js";

async function git(cwd: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn("git", args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (error) => resolve({ code: null, stdout, stderr: error.message }));
  });
}

export const GitStatusTool: Tool = {
  name: "git_status",
  description: "Show git status for the workspace.",
  readonly: true,
  parameters: { type: "object", properties: {} },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(_input, context) {
    const result = await git(context.cwd, ["status", "--short"]);
    return { ok: result.code === 0, content: result.stdout || result.stderr || "Clean or not a git repository." };
  },
};

export const GitDiffTool: Tool = {
  name: "git_diff",
  description: "Show git diff for the workspace or a path.",
  readonly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
    },
  },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(input, context) {
    const args = ["diff", "--"];
    if (typeof input.path === "string" && input.path) args.push(input.path);
    const result = await git(context.cwd, args);
    return { ok: result.code === 0, content: result.stdout || result.stderr || "No diff." };
  },
};

export function allGitTools(): Tool[] {
  return [GitStatusTool, GitDiffTool];
}
