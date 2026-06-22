// Single source of truth for tool registration. Novel
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
  proposalOnly?: boolean;
  includeGit?: boolean;
  includeShell?: boolean;
}

export function getTools(options: RegistryOptions = {}): Tools {
  const base: Tools = [
    ...allFileTools(),
    ...allSearchTools(),
    ...(options.includeGit ? allGitTools() : []),
    ...allAskUserTools(),
    ...(options.includeShell ? allShellTools() : []),
    ...createSkillTools(),
    ...createAgentTools(),
  ];
  if (options.readonlyOnly) return base.filter((tool) => tool.readonly);
  if (options.proposalOnly) return base.filter((tool) => tool.readonly || tool.name === "propose_file_change");
  return base;
}
