// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/tools.ts
// Mechanism copied: a single source of truth for tool registration. Novel
// Guide keeps only the platform subset needed for local novel workspaces.

import type { Tools } from "./tool.js";
import { allAskUserTools } from "./askUser.js";
import { allFileTools } from "./files.js";
import { allGitTools } from "./git.js";
import { allSearchTools } from "./search.js";
import { allShellTools } from "./shell.js";
import { createSkillTools } from "./skillTool.js";
import { createAgentTools } from "./agentTool.js";

export interface RegistryOptions {
  readonlyOnly?: boolean;
}

export function getTools(options: RegistryOptions = {}): Tools {
  const base: Tools = [
    ...allFileTools(),
    ...allSearchTools(),
    ...allGitTools(),
    ...allAskUserTools(),
    ...allShellTools(),
    ...createSkillTools(),
    ...createAgentTools(),
  ];
  return options.readonlyOnly ? base.filter((tool) => tool.readonly) : base;
}
