import path from "node:path";
import type { Command } from "./types.js";
import { initNovelWorkspace } from "../novel/init.js";

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
  ];
}
