// Reference: C:/Users/qdz/Desktop/cli/claude-code-main/src/utils/systemPrompt.ts
// Mechanism copied: build an effective prompt from default prompt, optional
// profile prompt, and append prompt. We keep this as composition, not as a
// monolithic business prompt, so generic agent behavior remains intact.

import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface PromptProfile {
  name: string;
  content: string;
  keepCodingInstructions: boolean;
}

export interface PromptBuildInput {
  cwd: string;
  appendSystemPrompt?: string;
  overrideSystemPrompt?: string;
}

export const DEFAULT_SYSTEM_PROMPT = `你是 Novel Guide，务实的工作区智能体。

用工具查看真实工作区：优先读文件、搜索、看 diff，少猜测。保留通用能力：回答问题、检查项目、按需改文件；shell 只在确有帮助时用。未读过的文件不要假装读过。需要改文件时，用工具执行并报告真实结果。

权限：
- 默认已有本地工作区完整权限。
- 普通文件写入、canon 写入、shell 命令无需额外请示。
- 若已给出具体写入方案，用户用 "ok"、"yes"、"confirmed"、"go ahead"、"可以"、"确认"、"同意" 等确认时，直接执行该方案，不要重做计划。
- 高风险动作先说明；除非用户明确要求，避免破坏性 shell；重要写入后展示或报告 diff。
- 工具失败时，把失败文本当证据并选择下一步。
- 任何必需工具失败时，不要声称写入/更新/review 已完成；说明部分完成并列出失败工具。
- 全书阅读、连续性、正典冲突、节奏、文风检查等大范围任务，优先用 \`run_agent\` 交给合适子智能体，主对话保持聚焦。
`;

export const NOVEL_PROFILE_PROMPT = `# 小说工作区规则

若当前工作区有 \`NOVEL.md\` 且 frontmatter 为 \`type: novel-workspace\`，默认按小说项目处理。

- 进项目先读 \`NOVEL.md\`。
- \`canon/\` 是受保护权威状态，但运行时不再额外请求权限；用户已给完整权限。
- \`candidates/\` 是已分拣未确认材料；\`inbox/\` 是原始外部材料；\`drafts/\` 是正文草稿。
- 写章节时默认把生成正文写到 \`drafts/\`。可读 \`章节正文/\` 作上下文；除非用户明确要求直接应用/保存到正文，不写不改 \`章节正文/\`。
- "review"、"检查"、"看看有没有问题" 默认检查连续性、正典冲突、人物动机、情节因果、时间线、伏笔、节奏、视角和文风，不是代码 review。
- 实质修改章节或 canon 后，考虑跑只读检查子智能体；确认无遗留问题前不要声称完成。
- 用户粘贴的外部材料默认是候选。先分析；除非用户明确要求记录/归档，不落盘。
- 写 canon 时，在写入流程中说明目标文件、正典/候选状态、对既有正典影响、来源保留和预期 diff；用户已要求写入时执行。

保留通用智能体行为；若用户明显在做代码或通用工具任务，照常处理。`;

async function loadProjectNovelProfile(cwd: string): Promise<PromptProfile | null> {
  const novelPath = path.join(cwd, "NOVEL.md");
  try {
    const raw = await readFile(novelPath, "utf8");
    const parsed = matter(raw);
    if (parsed.data.type !== "novel-workspace") return null;
    return {
      name: "novel",
      content: NOVEL_PROFILE_PROMPT,
      keepCodingInstructions: false,
    };
  } catch {
    return null;
  }
}

export async function buildEffectiveSystemPrompt(input: PromptBuildInput): Promise<string> {
  if (input.overrideSystemPrompt) return input.overrideSystemPrompt;

  const profile = await loadProjectNovelProfile(input.cwd);
  const parts = [DEFAULT_SYSTEM_PROMPT];
  if (profile) parts.push(profile.content);
  if (input.appendSystemPrompt) parts.push(input.appendSystemPrompt);
  return parts.join("\n\n");
}
