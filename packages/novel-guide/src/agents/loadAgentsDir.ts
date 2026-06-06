// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/tools/AgentTool/loadAgentsDir.ts
// Mechanism copied: project agents are markdown files under .claude/agents
// with frontmatter metadata and prompt body.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface AgentDefinition {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  prompt: string;
  filePath: string;
}

function parseTools(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return undefined;
}

export async function loadAgentsDir(cwd: string): Promise<AgentDefinition[]> {
  const agentsPath = path.join(cwd, ".claude", "agents");
  let entries;
  try {
    entries = await readdir(agentsPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: AgentDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const filePath = path.join(agentsPath, entry.name);
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = matter(raw);
      const name = typeof parsed.data.name === "string" ? parsed.data.name : entry.name.replace(/\.md$/i, "");
      const description = typeof parsed.data.description === "string" ? parsed.data.description : "Project subagent";
      agents.push({
        name,
        description,
        tools: parseTools(parsed.data.tools),
        model: typeof parsed.data.model === "string" ? parsed.data.model : undefined,
        prompt: parsed.content.trim(),
        filePath,
      });
    } catch {
      // Skip invalid agent files; agents are optional.
    }
  }
  return agents;
}

export async function findAgent(cwd: string, name: string): Promise<AgentDefinition | null> {
  const agents = await loadAgentsDir(cwd);
  return agents.find((agent) => agent.name === name) ?? null;
}
