import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "./types.js";
import { renderEjectHandoff } from "../handoff/render.js";
import { initNovelWorkspace } from "../novel/init.js";
import { resolveInside, relativeTo } from "../utils/paths.js";

export function getBuiltinCommands(): Command[] {
  return [
    {
      type: "local",
      name: "novel-init",
      description: "Initialize a Novel Guide workspace in the current directory.",
      argumentHint: "[作品名]",
      userInvocable: true,
      source: "builtin",
      async execute(args, context) {
        const projectName = args.trim() || path.basename(context.cwd);
        const result = await initNovelWorkspace(context.cwd, projectName);
        return {
          ok: true,
          content: [
            `Novel workspace initialized for: ${projectName}`,
            `Created: ${result.created.length}`,
            `Skipped: ${result.skipped.length}`,
            result.skipped.length ? `Existing items were not overwritten:\n${result.skipped.map((item) => `- ${item}`).join("\n")}` : "",
            "Tip: run git init when you are ready to track this workspace.",
          ].filter(Boolean).join("\n"),
        };
      },
    },
    {
      type: "local",
      name: "eject",
      description: "Export the current REPL session into a deterministic handoff prompt file.",
      argumentHint: "[chapter-target] [--chapter chNN] [--target name]",
      userInvocable: true,
      source: "builtin",
      async execute(args, context) {
        if (!context.engine) {
          return {
            ok: false,
            content: "/eject 只能在交互式 REPL 中导出当前会话。",
          };
        }

        const rendered = renderEjectHandoff({
          cwd: context.cwd,
          sessionId: context.engine.getSessionId(),
          messages: context.engine.getMessagesSnapshot(),
          args,
        });
        const outputPath = resolveInside(context.cwd, rendered.relativePath);
        const relativePath = relativeTo(context.cwd, outputPath);

        if (context.permissionMode === "confirm") {
          if (!context.askConfirmation) {
            return { ok: false, content: `需要确认后才能写入 ${relativePath}。` };
          }
          const approved = await context.askConfirmation(`写入 ${relativePath}？`);
          if (!approved) return { ok: false, content: `用户拒绝写入 ${relativePath}。` };
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, rendered.content, "utf8");

        return {
          ok: true,
          content: [
            `已导出 handoff：${relativePath}`,
            `来源消息数：${rendered.messageCount}`,
            "未调用模型；这是当前 REPL 会话快照的确定性抽取。",
          ].join("\n"),
          metadata: {
            fileChanges: [{ path: relativePath, operation: "write", charCount: rendered.content.length }],
          },
        };
      },
    },
  ];
}
