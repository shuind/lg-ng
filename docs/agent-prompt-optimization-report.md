# Agent 提示词优化方案

## 目标

当前 Novel Guide / LG agent 已经具备工作区读写、小说项目规则、子智能体、长上下文压缩和 LG 书籍索引等能力。优化提示词的目标不是继续堆规则，而是让模型在长对话和复杂小说项目里更稳定地做到：

1. 先读真实文件，再判断、续写或修改。
3. 减少重复提示词带来的 token 浪费和规则冲突。
4. 让子智能体产出更可合并、更可验证的结构化报告。
5. 让不同工作流（续写、改稿、检查、计划、归档）有更清晰的行为边界。

## 现状梳理

### 关键入口

- `packages/novel-guide/src/prompts/systemPrompt.ts`
  - `DEFAULT_SYSTEM_PROMPT`：通用 Novel Guide agent 规则。
  - `buildEffectiveSystemPrompt()`：拼装 system prompt。
- `apps/lg/lib/server/novel-guide-agent.ts`
  - `LG_LEGACY_PROMPT`：LG 旧目录兼容规则。
  - `buildPrompt()`：每轮用户请求的 prompt 拼装。
  - `runNovelGuideReview()`：并发调用四个只读 review 子智能体。
- `packages/novel-guide/src/agent/engine.ts`
  - `AgentEngine`：system prompt 注入、project context 注入、session 保存、compaction、subagent 执行。
  - `summarizeForCompaction()`：长上下文压缩。
- `packages/novel-guide/src/novel/templates.ts`
  - 初始化 `NOVEL.md`、skills、output style、review 子智能体 prompt。
- `packages/novel-guide/src/tools/*.ts`
  - 工具描述里也包含大量小说写作策略，例如 drafts 优先、章节正文保护、search_canon 优先等。

### 当前 prompt 分层

运行时大致是：

```text
system:
  DEFAULT_SYSTEM_PROMPT
  + LG_LEGACY_PROMPT

system meta:
  - 工作区路径
  - 文件为准声明
  - thread memory
  - 可用技能摘要
  - 可用子智能体摘要

user:
  LG 书籍
  + 章节草稿优先策略
  + 已选工作流
  + 回复约束
  + 已选写作技能
  + 最近 LG 前文对话（新 session 才注入）
  + 用户请求
  + 用户显式引用
```

这套结构的优点是信息完整、能兼容 Novel Guide 原生工作区和旧 LG 目录；缺点是同类规则分散在多层，模型会反复看到“drafts 优先 / 先读文件 / 旧目录也重要 / review 是小说检查”等规则，长对话时 token 成本和行为冲突都会上升。

## 主要问题

### 1. 重复规则过多，缺少单一事实源

重复最明显的规则包括：

- 章节正文默认写 `drafts/`。
- 除非明确要求，不写不改 `章节正文/`。
- 写前先读真实文件。
- `review / 检查` 在小说工作区默认是连续性、设定、节奏、文风检查。
- 不要因为 `NOVEL.md` / `canon/` 稀疏就判断项目缺设定，要查旧 LG 目录。

这些规则分布在：

- `LG_LEGACY_PROMPT`
- `formatChapterDraftPolicy()`
- `formatWorkflowAction()`
- 文件工具描述
- 初始化模板 `GUIDE.md` / output style / skills

重复本身不一定错，但现在是“同义重复”，不是“层级强化”。模型看到多处相似规则时，可能把它们当成独立约束，导致输出保守、冗长，或在边界条件上犹豫。

### 2. 每轮 prompt 信息的优先级不够显式

当前 prompt 有很多段落，但没有统一声明优先级。实际应该是：

1. 本轮用户明确要求。
2. 用户选中的引用与工作流动作。
3. 启用的回复约束和写作技能。
4. thread memory / 近期对话。

现在这些信息是按文本顺序出现，模型能大致理解，但没有明确冲突处理规则。例如“回复约束只约束最终回复”已经写了，但“工作流动作 vs 用户请求”“thread memory vs 当前文件事实”“索引摘要 vs 文件正文”还可以更明确。

### 3. 已有 session 时不注入 LG 前文对话，可能丢 UI 语境

`runNovelGuideAgent()` 中：

```ts
const promptThreadMessages = session ? [] : input.threadMessages ?? []
```

这能避免把 engine session 和 UI thread 重复塞进上下文，但也有副作用：如果 UI 线程分叉、用户在 LG 侧修改了可见上下文、或 thread memory 还没吸收最新纠正，已有 agent session 的后续轮次可能看不到 LG UI 的最新语境。

建议不要简单恢复完整 threadMessages，而是注入一个“本轮 UI 可见上下文摘要 / recent user corrections”小卡片，最多保留最近 2-4 条用户纠正或显式决定。



这本身是合理分层，但目前没有根据任务动态裁剪：

- 聊天问答不一定需要完整文件索引。
- 续写章节更需要相关章节、大纲、人物、世界观路径。
- review 更需要范围、维度、证据格式。
- 归档更需要 canon/candidates 状态和来源边界。

统一塞入短索引能保证召回，但随着项目变大，模型可能被无关路径干扰。

### 5. 子智能体 prompt 结构偏薄

四个 review 子智能体已有角色和 JSON schema，但还缺少：

- 读取策略：先读哪些入口文件，再搜哪些目录。
- 证据强度：什么算高置信，什么必须降级为疑问。
- 去重规则：同一问题跨多个文件出现时如何合并。
- 严重度定义：high / medium / low 的判定标准。
- 报告预算：最多报告多少条、优先级如何排序。
- 不确定性输出：找不到文件、范围过大、证据不足时怎么说。

这会导致不同子 agent 输出粒度不一致，主线程只能拼接，难以合并成真正的体检报告。

### 6. Compaction prompt 没有专门服务小说创作状态

长对话压缩目前是通用摘要。小说创作场景里，压缩最重要的是保留：

- 用户已拍板的设定和禁区。
- 正在写的章节目标。
- 已确定的修改方向。
- 用户对文风、节奏、人物动机的纠正。
- 已执行的文件变更和未完成事项。

如果 compaction 只做普通对话摘要，长会话里最容易丢的正是这些“作者偏好和决策”。

## 推荐方案

## 方案 A：重构 prompt 分层，建立规则单一事实源

### 做法

新增一个内部 prompt 片段模块，例如：

```ts
packages/novel-guide/src/prompts/novelRules.ts
```

把核心规则拆成可组合片段：

- `FILE_TRUTH_RULES`：文件为准、索引不是事实、未读不判断。
- `DRAFT_POLICY_RULES`：章节正文默认 drafts，章节正文目录保护。
- `CANON_BOUNDARY_RULES`：canon/candidates/inbox/archive 边界。
- `LG_LEGACY_DIRECTORY_RULES`：旧 LG 目录是一等材料。
- `REVIEW_SEMANTICS_RULES`：review 在小说项目里的默认含义。
- `WRITE_REPORTING_RULES`：写入前后如何报告。

然后各层只引用需要的片段，避免手写多份相似文本。

### 调整建议

- `LG_LEGACY_PROMPT` 只保留旧 LG 目录兼容，不重复通用 drafts 规则。
- `formatChapterDraftPolicy()` 可以改为更短的每轮强约束，只在写作/改稿相关 workflow 时注入。
- 工具 description 只写工具自身边界，少承担业务规则；业务规则由 system/workflow prompt 负责。

### 预期收益

- token 更省。
- 行为边界更清晰。
- 后续改规则只改一处，避免 prompt 漂移。

## 方案 B：把每轮 prompt 改成“任务卡 + 上下文卡 + 约束卡”

当前 `buildPrompt()` 是线性拼接。建议改成固定结构：

```text
# 本轮任务
- 书籍：...
- 用户请求：...
- 工作流：continue / revise / plan / diagnose / none
- 是否允许写入：...
- 期望产物：回复 / 文件提案 / 实际写入 / 检查报告

# 高优先级上下文
- 用户显式引用
- 已选技能
- 回复约束
- 最近用户纠正 / thread memory 摘要

# 项目导航
- 稳定索引摘要
- 相关目录提示

# 执行规则
- 文件为准
- 需要判断/修改前必须读取路径
- 不足时最小追问
- 输出格式
```

重点是让模型先确定“这轮到底要做什么”，再看“有哪些材料”，最后看“怎么执行”。

### 工作流动作建议补字段

目前 `WorkflowAction` 只转成一句说明。建议在 prompt 中结构化表达：

```text
工作流动作：continue
允许写入：否，必须使用 propose_file_change
默认目标：drafts/
禁止：直接改 章节正文/
最终输出：简短说明 + 提案摘要
```

对 `revise / continue / plan / diagnose / plant / resolve` 都用同一结构表达，减少模型误判。

## 方案 C：改进 UI thread 与 agent session 的合并策略

不要在已有 session 时完全丢弃 `threadMessages`，也不要完整重复注入。建议新增函数：

```ts
formatRecentThreadDelta(messages, sessionUpdatedAt)
```

或更简单地注入最近 2-4 条 UI 可见消息，但只保留：

- 用户明确纠正。
- 用户拍板的设定。
- 用户改变任务目标。
- 上一轮 assistant 给出的未完成承诺。

Prompt 文案可以是：

```text
LG 本轮可见对话增量：
这些内容可能尚未进入 agent session 或 thread memory。若与真实文件冲突，以文件为准；若与旧对话冲突，以这里较新的用户决定为准。
```

这能避免 session 长期运行时和 UI 对话脱节。

## 方案 D：按任务动态裁剪 project context


```ts
type PromptTaskMode = "chat" | "continue" | "revise" | "review" | "archive" | "plan" | "diagnose"
```

不同 mode 注入不同上下文：

- `chat`：少量索引 + thread memory。
- `continue/revise`：章节大纲、章节正文、drafts、人物/世界观路径优先。
- `review`：范围、检查维度、相关章节和 canon 路径。
- `archive`：canon/candidates/inbox 路径和来源边界。
- `plan/diagnose`：卷纲、章节大纲、剧情管理、读者体验。

第一阶段不必做复杂检索，只要按目录类别限制数量即可。例如续写时减少“无关设定卡”，提高“章节大纲/章节正文/人物设定”的路径权重。

## 方案 E：强化 review 子智能体 prompt

四个子智能体建议共享一段 `REVIEW_AGENT_BASE_PROMPT`，再叠加各自维度。

### 共享规则建议

```text
你是只读评审员。不要改文件。不要凭索引摘要直接下结论。

读取策略：
1. 先读 NOVEL.md / GUIDE.md。
2. 根据检查范围定位章节、大纲、canon 和旧 LG 目录。
3. 每个 issue 必须有至少一条文件证据；证据不足放入 questions，不放入 issues。

严重度：
- high：会直接破坏读者理解、正典一致性、章节因果或主线承诺。
- medium：明显削弱效果，但作者可能有意为之。
- low：局部瑕疵、建议性优化。

输出限制：
- issues 最多 10 条，按 severity 和确定性排序。
- 合并同源重复问题。
- 不输出完整正文，不长篇摘录。
```

### schema 建议

把当前 schema 扩展为：

```json
{
  "summary": "一句话结论",
  "coverage": {
    "read": ["实际读取的关键路径"],
    "notRead": ["因范围/缺失未读取但可能相关的路径"],
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
```

这样主线程可以把多个子报告合并成“覆盖范围 + 高置信问题 + 待确认问题”，而不是简单拼接四段文本。

## 方案 F：为 compaction 增加小说项目专用摘要格式

`structuredCompactionPrompt()` 建议增加小说工作区专用栏目：

```text
请保留以下信息，按栏目输出：

1. 用户已拍板的项目事实
2. 用户偏好的文风/节奏/禁区
3. 当前正在处理的章节或文件
4. 已完成的文件变更
5. 未完成任务和下一步
6. 重要工具失败或不确定项
7. 可丢弃的寒暄、重复解释和长篇正文摘录
```

特别要强调：

- 不要把 assistant 的建议当成用户已确认事实。
- 不要把索引摘要当成正典。
- 保留用户纠正的优先级高于 assistant 自述。

这能显著改善长会话续写/改稿时的稳定性。

## 方案 G：增加少量 prompt eval cases

建议补几组针对提示词行为的 eval，不必先做复杂自动评分，可以从 snapshot 或 mock client 开始。

### 建议用例

1. **旧 LG 目录召回**
   - `NOVEL.md/canon` 很空，但 `人物设定/` 有人物文件。
   - 用户问“主角是谁”。
   - 期望：agent 先读旧目录，不回答“缺少设定”。

2. **续写必须提案到 drafts**
   - workflowAction = `continue`。
   - 用户说“续写下一章”。
   - 期望：调用 `propose_file_change`，目标在 `drafts/`，不直接写 `章节正文/`。

3. **明确要求直存正文时允许章节正文**
   - 用户说“直接保存到章节正文”。
   - 期望：允许写/提案到 `章节正文/`，不再过度拒绝。

4. **已有 session 的最新用户纠正不丢失**
   - session 里旧设定为 A，UI thread 最近用户纠正为 B。
   - 期望：本轮以 B 作为用户最新决定，但涉及文件事实仍先读文件。

5. **review 子智能体证据不足时不编造 issue**
   - 给一个范围但文件缺失。
   - 期望：输出 questions / coverage.notRead，而不是假装检查完成。

6. **compaction 保留用户拍板**
   - 长对话里用户多次纠正文风。
   - 期望：压缩摘要保留最终拍板，不保留被推翻版本。

## 落地顺序

### 第一阶段：低风险 prompt 收敛

1. 新增共享 prompt 片段模块。
2. 去掉 `LG_LEGACY_PROMPT`、`formatChapterDraftPolicy()`、工具 description 中的同义重复。
3. 把 `buildPrompt()` 改成“任务卡 / 上下文卡 / 执行规则”结构。
4. 不改工具、不改模型调用、不改 session 存储。

这一阶段主要降低 token 和冲突风险，改动小、容易回滚。

### 第二阶段：子智能体结构化升级

1. 增加 `REVIEW_AGENT_BASE_PROMPT`。
2. 扩展四个 review 子 agent schema。
3. `runNovelGuideReview()` 不再简单拼接，先合并 coverage、issues、questions。
4. 增加 review eval cases。

这一阶段提升“检查”质量，适合和 UI 的体检报告展示一起做。

### 第三阶段：长上下文与 thread delta

1. 为已有 session 注入轻量 UI thread delta。
2. 调整 compaction prompt，保留作者拍板、文风偏好和未完成任务。
3. 在 context window UI 中区分 session、project context、thread delta。

这一阶段改善长会话稳定性，但要注意避免重复上下文。

### 第四阶段：动态 project context

1. 引入 `PromptTaskMode`。
2. 按 workflowAction 和用户意图选择索引类别。
3. 对大项目做 token 对比和行为回归。

这一阶段收益较大，但涉及索引策略，建议最后做。

## 建议的最终 prompt 形态示例

```text
# 本轮任务
书籍：{title} ({bookId})
工作流：continue
允许写入：只能创建可审阅提案，不直接改目标正文
默认目标：drafts/
用户请求：...

# 高优先级上下文
## 用户显式引用
- ...

## 最近用户决定
- ...

## 写作技能
- ...

## 回复约束
- ...

# 项目导航
这些只是路径和摘要，不是完整事实。涉及判断或修改前必须读取文件。
- 人物设定：...
- 章节大纲：...
- 章节正文：...
- drafts：...

# 执行规则
1. 文件事实高于索引摘要和旧对话。
2. 用户本轮明确要求高于默认工作流规则。
3. 章节续写/改稿默认走 drafts/ 或 propose_file_change。
4. 不足以执行时只问最小必要问题。
5. 最终回复简短说明读了什么、做了什么、产物在哪里。
```

## 结论

优先做“规则收敛 + 每轮 prompt 结构化”。这能在不改变底层 agent 架构的情况下，最快改善稳定性、降低 token 浪费，并减少模型在 drafts、旧 LG 目录、review 语义上的摇摆。

随后再升级 review 子智能体和 compaction。review 适合用更严格 schema 提升报告质量；compaction 则是长对话体验的关键，应专门保留作者拍板、文风偏好、当前章节目标和未完成任务。