export const FILE_TRUTH_RULES = [
  "项目事实以真实文件为准；索引、摘要、旧对话和记忆只做导航。",
  "涉及具体人物、设定、章节、正文、伏笔或规则时，先读取对应文件再判断或修改。",
  "未读取到证据时，不要把猜测写成事实；需要时提出最小必要问题。",
].join("\n");

export const DRAFT_POLICY_RULES = [
  "章节正文生成、续写、重写或改稿默认进入 drafts/。",
  "章节正文/ 可以作为上下文读取；除非用户明确要求直接应用、保存或写入章节正文，否则不写不改 章节正文/。",
  "若对应草稿不存在，在 drafts/ 下用章节号或标题创建清晰的 Markdown 文件。",
  "除非用户明确要求更新状态追踪，否则不要因为起草正文顺手修改 状态追踪/。",
].join("\n");

export const LG_CONTENT_DIRECTORY_RULES = [
  "除 Novel Guide 标准目录外，工作区还可能有 LG 内容目录。",
  "人物设定/、世界观/、卷纲/、章节大纲/、章节正文/、剧情管理/、状态追踪/、读者体验/、写作约束/、章节摘要/、检查报告/ 都是一等小说材料。",
  "不要因为 NOVEL.md、canon/ 或 drafts/ 稀疏就判断项目缺人物、设定、大纲或正文；先查 LG 内容目录。",
].join("\n");

export const LG_LEGACY_DIRECTORY_RULES = LG_CONTENT_DIRECTORY_RULES;

export const REVIEW_SEMANTICS_RULES = [
  "\"review\"、\"检查\"、\"看看有没有问题\" 在小说项目里默认指连续性、正典冲突、人物动机、情节因果、时间线、伏笔、节奏、视角和文风检查，不是代码 review。",
  "大范围检查优先使用只读 review 子智能体；确认无遗留问题前不要声称完成。",
].join("\n");

export const WRITE_REPORTING_RULES = [
  "写入前明确目标路径和写入意图。",
  "写入后报告真实变更、失败工具和产物位置。",
].join("\n");

export const DRAFT_POLICY_TOOL_HINT = "小说工作区生成章节正文默认使用 drafts/；用户明确要求直存正文时才用 章节正文/。";

export const SEARCH_CANON_TOOL_HINT = "查人物、设定、伏笔、长文连续性时优先于 grep；默认覆盖 canon、drafts、章节正文和 LG 内容目录。";

export const REVIEW_AGENT_BASE_PROMPT = `共享评审规则：
- 你是只读评审员。不要修改文件，不要凭索引摘要直接下结论。
- 先读 NOVEL.md / GUIDE.md；再根据检查范围定位章节、大纲、canon 和 LG 内容目录。
- 范围很大或读不完时，先围绕用户指定范围、最近改动章节、显式引用实体和直接相关 canon 抽样；在 coverage.read / coverage.notRead 里声明实际读取边界，不要假装读完全书。
- 每个 issue 必须有至少一条文件证据；证据不足放入 questions，不放入 issues。
- 默认 severity：high = 足以破坏该检查维度的核心阅读体验或项目承诺；medium = 明显削弱效果但可能是作者有意为之；low = 局部瑕疵或建议性优化。若专属 agent 给出更贴合本维度的 severity 锚点，以专属锚点为准。
- issues 最多 10 条，按 severity 和确定性排序；合并同源重复问题；不输出完整正文。

合格 issue 极短例：
- 证据：章节A写“顾慎独自入城”，章节B同一时刻写“顾慎守在山门”。结论：同一人物同一时间位置冲突，列入 issues。

应放入 questions 的反例：
- 只因“顾慎看起来可能隐瞒实力”就推断他欺骗师门，但没有文件证据证明欺骗或师门认知差异；这只能放入 questions，不能列 issue。`;

export const REVIEW_AGENT_JSON_SCHEMA = `必须返回 JSON-in-markdown：
\`\`\`json
{
  "summary": "一句话结论",
  "coverage": {
    "read": ["实际读取的关键路径"],
    "notRead": ["因范围、缺失或预算未读取但可能相关的路径"],
    "confidence": "low|medium|high"
  },
  "issues": [
    {
      "type": "...",
      "severity": "low|medium|high",
      "confidence": "low|medium|high",
      "message": "问题描述",
      "evidence": [{"path": "文件路径", "line": 1, "excerpt": "短证据"}],
      "whyItMatters": "为什么影响小说效果或连续性",
      "suggestion": "建议"
    }
  ],
  "questions": ["证据不足时需要作者确认的问题"],
  "nextActions": ["下一步建议"]
}
\`\`\``;
