import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "./types.js";
import { renderEjectHandoff } from "../handoff/render.js";
import { initNovelWorkspace } from "../novel/init.js";
import { copyTextToClipboard } from "../utils/clipboard.js";
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
        let content = rendered.content;
        let polishNote = "未调用模型；这是当前 REPL 会话快照的确定性抽取。";
        if (rendered.mode === "polish") {
          if (!context.engine.polishHandoffDraft) {
            return { ok: false, content: "当前运行环境不支持 /eject --polish。" };
          }
          content = await context.engine.polishHandoffDraft(content, {
            profile: rendered.profile,
            chapter: rendered.chapter,
            target: rendered.target,
          });
          polishNote = "已按 --polish 显式调用一次模型轻收敛；未开放工具，要求不新增事实。";
        }
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
        await writeFile(outputPath, content, "utf8");

        const copyResult = rendered.copy ? await copyTextToClipboard(content) : null;
        const copyNote = copyResult
          ? copyResult.ok
            ? `已复制到剪贴板：${copyResult.method}`
            : `剪贴板复制失败，请手动复制文件内容：${copyResult.error}`
          : "未复制到剪贴板；需要时使用 --copy。";

        return {
          ok: true,
          content: [
            `已导出 handoff：${relativePath}`,
            `来源消息数：${rendered.messageCount}`,
            `预计长度：约 ${rendered.estimatedTokens} tokens`,
            `目标 profile：${rendered.profile}`,
            polishNote,
            copyNote,
          ].join("\n"),
          metadata: {
            fileChanges: [{ path: relativePath, operation: "write", charCount: content.length }],
          },
        };
      },
    },
    {
      type: "local",
      name: "chapter-delta",
      description: "Run the readonly chapter-delta agent on a draft path and return structured state changes.",
      argumentHint: "<draft-path>",
      userInvocable: true,
      source: "builtin",
      async execute(args, context) {
        if (!context.engine?.runReadonlySubAgent) {
          return { ok: false, content: "/chapter-delta 只能在支持只读子智能体的交互式 REPL 中运行。" };
        }
        const draftPath = args.trim().split(/\s+/)[0];
        if (!draftPath) return { ok: false, content: "用法：/chapter-delta <draft-path>" };
        const absolutePath = resolveInside(context.cwd, draftPath);
        const relativePath = relativeTo(context.cwd, absolutePath);
        const result = await context.engine.runReadonlySubAgent({
          agent: "chapter-delta",
          prompt: [
            `章节正文路径：${relativePath}`,
            "主流程没有读取正文全文。请你作为只读子智能体读取该文件，抽取状态变化 delta。",
            "只返回结构化 delta、证据短摘和建议更新；不要改文件，不要返回完整正文。",
          ].join("\n"),
        });
        return { ok: true, content: result };
      },
    },
  ];
}
