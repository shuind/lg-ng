export const NOVEL_DIRECTORIES = [
  ".claude",
  ".claude/agents",
  ".claude/output-styles",
  ".claude/skills",
  ".claude/skills/archive",
  ".claude/skills/intake",
  ".claude/skills/novel-review",
  "archive/characters",
  "archive/foreshadowing",
  "archive/plots",
  "archive/settings",
  "archive/timeline",
  "candidates/characters",
  "candidates/plots",
  "candidates/settings",
  "canon/characters",
  "canon/foreshadowing",
  "canon/settings",
  "canon/timeline",
  "drafts",
  "inbox",
] as const;

export const GITKEEP_FILES = [
  "archive/characters/.gitkeep",
  "archive/foreshadowing/.gitkeep",
  "archive/plots/.gitkeep",
  "archive/settings/.gitkeep",
  "archive/timeline/.gitkeep",
  "candidates/characters/.gitkeep",
  "candidates/plots/.gitkeep",
  "candidates/settings/.gitkeep",
  "canon/characters/.gitkeep",
  "canon/foreshadowing/.gitkeep",
  "canon/settings/.gitkeep",
  "canon/timeline/.gitkeep",
  "drafts/.gitkeep",
  "inbox/.gitkeep",
] as const;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createNovelMd(projectName: string): string {
  return `---
project: ${projectName}
type: novel-workspace
genre: 待定
tone: 待定
pov: 待定
status: planning
current_chapter:
word_count: 0
updated: ${todayISO()}
---

# ${projectName} - 项目清单

## 一句话定位
TODO: 用一句话说明这本书的核心人物、核心欲望、核心阻碍与主要承诺。

## 目录约定
- \`canon/\`: 正典，唯一权威。仅在用户明确要求落盘时写入；普通文件写入不追加确认，依靠 ledger 回退。
- \`candidates/\`: 候选设定，已分拣未入典。
- \`inbox/\`: 外部材料隔离区，未分拣。
- \`drafts/\`: 正文草稿。
- \`archive/\`: 废案，留痕不删。

## 正典/候选边界
- 用户粘贴的外部对话、灵感、片段、设定方案，默认是候选材料，不直接进 \`canon/\`。
- 写入 \`canon/\` 时说明：写哪些文件、正典还是候选、是否影响已有设定、是否保留来源；完成后报告实际改动。
- 仅当用户明确说“整理进去/记下来/写入项目/归档/入正典/更新到文件”时才落盘。

## 核心实体清单
- TODO: 主角 -> \`canon/characters/TODO-slug.md\`
- TODO: 关键设定 -> \`canon/settings/TODO-slug.md\`

## 当前 open 伏笔
- TODO: \`fs:TODO\` 标题（planted ch??, expect by ch??）

## 待确认问题
- [ ] TODO: 需要作者拍板的问题。

## 术语 / 专名
见 \`canon/glossary.md\`。
`;
}

export const CLAUDE_MD = `# 小说工作区工作约定

- 这是小说创作工作区，不是代码仓库。默认把内容当创作材料。
- 进项目先读 \`NOVEL.md\`。
- \`canon/\` 是权威区：仅在用户明确要求落盘时写入；写入时说明目标与影响，完成后报告实际改动。
- “review / 检查 / 看看有没有问题”默认指设定冲突、连续性、伏笔、人物动机、情节因果、节奏和文风。
- 人物和设定检索应优先读取 \`canon/\` 下实体文件的 \`aliases\`，不要只 grep 正式名。
- 用户粘贴的外部对话、官网大模型回复、灵感记录，默认是候选材料；不要自动入正典。
`;

export const SETTINGS_JSON = `{
  "outputStyle": "novel"
}
`;

export const NOVEL_OUTPUT_STYLE_MD = `---
name: novel
description: 小说创作工作区智能体 - 默认领域从代码切到创作材料，保留全部通用能力
keep-coding-instructions: false
---

你是 Novel Guide，一个理解小说项目的工作区智能体。你保留通用智能、工具使用、上下文管理和文件理解能力；唯一变化是默认领域：当前工作区默认是小说创作材料工作区，不是代码仓库。

进入工作区时先确认 \`NOVEL.md\` 且 frontmatter 包含 \`type: novel-workspace\`。存在则按目录约定与正典/候选边界行事；不存在则退回通用行为。

默认任务语义：
- “review / 检查 / 看看有没有问题”指设定冲突、人物动机、情节因果、时间线、节奏、伏笔兑现、文风一致性。
- “整理一下”指材料分拣或归档，不是重构代码。
- 明显涉及代码、工具或通用问题时，照常处理。

外部材料默认是候选，不是正典。讨论、分析、问意见时不落盘。仅当用户明确表达落盘意图时才写文件。

写入 \`canon/\` 是高影响动作：当用户明确要求落盘时，说明目标文件、正典/候选状态、影响范围、来源保留和 diff 方案并执行；普通文件写入不追加权限确认，完成后报告实际改动。
`;

export const INTAKE_SKILL_MD = `---
name: intake
description: 当用户粘贴或导入外部创作材料时，进行分拣、比对与归档建议。不自动写入正典。
when_to_use: 用户贴进一大段创作相关文本，或说“看看这段材料/这是我和AI聊的设定/帮我分拣”。
---

# 材料分拣

目标：把外部材料变成“已定类型、已查冲突、有归档建议”的候选，默认不落正典、不擅自落盘。

步骤：
1. 确认根目录有 \`NOVEL.md\` 且 \`type: novel-workspace\`。
2. 将材料切分为人物、设定、剧情桥段、正文片段、风格参考、待确认问题、纯对话记录等类型。
3. 对每段材料检索 \`canon/\` 与 \`candidates/\`，找冲突、重复、可合并点。
4. 输出分拣报告：类型、摘要、与本地关系、建议去向。
5. 未经用户确认，不写任何文件。
`;

export const ARCHIVE_SKILL_MD = `---
name: archive
description: 当用户明确要求落盘、归档、入正典、更新到文件时，执行保守写盘流程。
when_to_use: 用户说“整理进去/记下来/写入项目/归档/这个设定定了/入正典/更新NOVEL”。
---

# 归档与入典

落盘需要明确用户意图。原则：说明方案 -> 写入 -> 报告变更，并依靠 ledger 支持回退。

候选提升正典前必须：
1. 找到目标候选文件。
2. 补全 schema：id、aliases、first_appearance、derived_from。
3. 扫描与现有 canon 的冲突。
4. 写入前说明目标文件、正典/候选、影响范围、来源保留。
5. 用户已明确要求入典或归档时写 \`canon/\`，并更新 \`NOVEL.md\` 指针。
`;

export const NOVEL_REVIEW_SKILL_MD = `---
name: novel-review
description: 小说创作工作区里的 review/检查，检查设定冲突、人物动机、情节因果、时间线、节奏、伏笔兑现、文风一致性。
when_to_use: 用户在小说工作区说“review/检查/看看有没有问题/审一下这章/前后矛盾吗”。
argument-hint: "[章节或范围，如 ch05 或 ch03-ch07]"
---

# 小说 Review

检查维度：
- 设定冲突：对照 canon 实体文件与别名表。
- 时间线：sort_key 排序、年龄/间隔、同一人物位置。
- 伏笔兑现：open 伏笔是否逾期。
- 人物动机：比对人物文件与章节行为。
- 情节因果：事件链是否成立。
- 节奏与文风：对照 NOVEL.md 的 tone/pov。

只报告，不擅自改。用户要求修改时再动手；改正典走 archive 流程。
`;

export const CONTINUITY_AGENT_MD = `---
name: continuity-checker
description: 检查小说连续性的只读评审员：逾期伏笔、时间线、关系图、POV。返回结构化报告，不改文件。
tools: [read_file, grep, glob]
model: inherit
---

你是小说连续性审查员。你的工作像跑 linter：枚举客观、可验证的连续性问题，给证据，不做主观文学评价，不改文件。

检查：逾期 open 伏笔、时间线排序违例、同一人物同时出现在不同地点、人物关系反向缺失、POV 疑似越界。
`;

export const CANON_CONFLICT_AGENT_MD = `---
name: canon-conflict
description: 只读评审员，检查新材料或候选设定是否与现有正典冲突。返回冲突清单，不改文件。
tools: [read_file, grep, glob]
model: inherit
---

你是设定冲突审查员。给定待审内容和现有 canon，找出冲突、重复、可合并点与全新内容。只读、只报告。
`;

export const GLOSSARY_MD = `# 术语 / 专名表

| 术语 | 类型 | 说明 | 首次出现 |
|---|---|---|---|
| TODO | TODO | TODO | TODO |
`;

export function templateFiles(projectName: string): Record<string, string> {
  const gitkeep = Object.fromEntries(GITKEEP_FILES.map((file) => [file, "\n"]));
  return {
    "NOVEL.md": createNovelMd(projectName),
    "CLAUDE.md": CLAUDE_MD,
    ".claude/settings.json": SETTINGS_JSON,
    ".claude/output-styles/novel.md": NOVEL_OUTPUT_STYLE_MD,
    ".claude/skills/intake/SKILL.md": INTAKE_SKILL_MD,
    ".claude/skills/archive/SKILL.md": ARCHIVE_SKILL_MD,
    ".claude/skills/novel-review/SKILL.md": NOVEL_REVIEW_SKILL_MD,
    ".claude/agents/continuity-checker.md": CONTINUITY_AGENT_MD,
    ".claude/agents/canon-conflict.md": CANON_CONFLICT_AGENT_MD,
    "canon/glossary.md": GLOSSARY_MD,
    ...gitkeep,
  };
}
