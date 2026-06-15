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

async function ensureGitWorkspace(cwd: string): Promise<{ ok: true } | { ok: false; content: string }> {
  const result = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (result.code === 0 && result.stdout.trim() === "true") return { ok: true };
  return { ok: false, content: "当前工作区不是 git 仓库，已跳过 git 状态检查。" };
}

export const GitInitTool: Tool = {
  name: "git_init",
  description: "在当前工作区初始化 git 仓库。",
  readonly: false,
  parameters: { type: "object", properties: {} },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(_input, context) {
    const workspace = await ensureGitWorkspace(context.cwd);
    if (workspace.ok) return { ok: true, content: "当前工作区已经是 git 仓库。" };
    const result = await git(context.cwd, ["init"]);
    return { ok: result.code === 0, content: result.stdout || result.stderr || "已初始化 git 仓库。" };
  },
};

export const GitStatusTool: Tool = {
  name: "git_status",
  description: "查看工作区 git 状态。",
  readonly: true,
  parameters: { type: "object", properties: {} },
  requiresPermission() {
    return { allowed: true };
  },
  async execute(_input, context) {
    const workspace = await ensureGitWorkspace(context.cwd);
    if (!workspace.ok) return { ok: true, content: workspace.content };
    const result = await git(context.cwd, ["status", "--short"]);
    return { ok: result.code === 0, content: result.stdout || result.stderr || "工作区干净。" };
  },
};

export const GitDiffTool: Tool = {
  name: "git_diff",
  description: "查看整个工作区或指定路径的 git diff。",
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
    const workspace = await ensureGitWorkspace(context.cwd);
    if (!workspace.ok) return { ok: true, content: "当前工作区不是 git 仓库，已跳过 git diff。" };
    const args = ["diff", "--"];
    if (typeof input.path === "string" && input.path) args.push(input.path);
    const result = await git(context.cwd, args);
    return { ok: result.code === 0, content: result.stdout || result.stderr || "无 diff。" };
  },
};

export function allGitTools(): Tool[] {
  return [GitInitTool, GitStatusTool, GitDiffTool];
}
