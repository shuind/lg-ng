import type { Command } from "./types.js";
import { getBuiltinCommands } from "./builtin.js";
import { loadSkillsDir, skillToPromptCommand } from "../skills/loadSkillsDir.js";

export async function getCommands(cwd: string): Promise<Command[]> {
  const skills = await loadSkillsDir(cwd);
  return [
    ...getBuiltinCommands(),
    ...skills.map(skillToPromptCommand),
  ];
}
