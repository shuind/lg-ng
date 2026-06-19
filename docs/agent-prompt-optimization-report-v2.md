# Agent 提示词优化方案（修订版）

## 目标

当前 Novel Guide / LG agent 已经有工作区读写、小说项目规则、子智能体、长上下文压缩、LG 内容目录索引等能力。下一步优化不是继续堆规则，而是让模型在长对话和复杂小说项目里更稳定地做到：

1. 先读真实文件，再判断、续写或修改。
2. 明确区分聊天上下文、稳定索引、正典事实、草稿正文、LG 内容目录。
3. 减少重复规则带来的 token 浪费和行为漂移。
4. 让 review 子智能体输出更容易合并和验证的结构化报告。
5. 让续写、改稿、检查、计划、归档这些工作流的边界更清楚。

## 当前基线

### 运行时分层

- `packages/novel-guide/src/prompts/systemPrompt.ts`
  - `DEFAULT_SYSTEM_PROMPT`
  - `buildEffectiveSystemPrompt()`
- `apps/lg/lib/server/novel-guide-agent.ts`
  - `LG_LEGACY_PROMPT`
  - `buildPrompt()`
- `packages/novel-guide/src/agent/engine.ts`
  - `structuredCompactionPrompt()`
  - `runSubAgent()`
- `packages/novel-guide/src/novel/templates.ts`
  - 四个 review 子智能体模板
- `packages/novel-guide/src/tools/*.ts`
  - 工具 description 里也包含章节草稿、正典边界、提案写入等提示

### 现有事实

- `structuredCompactionPrompt()` 已经是小说项目专用的结构化压缩，不是普通聊天摘要。
- review 子智能体已经有 JSON-in-markdown 的返回要求，但 schema 还偏薄。
- `proposalOnly`、`readonlyOnly`、工具 registry 这些约束，和 prompt 不是同一层，不能只靠改文案解决。

## 主要问题

### 1. 规则分散，存在重复，但不是“没有规则”

重复最明显的部分包括：

- 章节正文默认写 `drafts/`
- 除非明确要求，不写不改 `章节正文/`
- 写前先读真实文件
- `review / 检查` 默认指小说检查
- LG 内容目录仍是一等材料


### 2. 每轮 prompt 没有显式优先级

当前 `buildPrompt()` 还是线性拼接：

- 书籍信息
- 草稿策略
- 工作流动作
- 回复约束
- 技能摘要
- thread messages
- 用户请求
- 显式引用

模型能理解大意，但没有统一的冲突处理顺序。尤其是“用户本轮要求”“工作流动作”“thread memory”“文件事实”“索引摘要”之间，优先级还可以更明确。

### 3. 已有 session 时会丢掉 UI 线程增量

当前逻辑是：

```ts
const promptThreadMessages = session ? [] : input.threadMessages ?? []
```

这能避免 session 和 UI thread 重复注入，但也会让已有 session 后续轮次看不到最新用户纠正或 UI 里的显式决定。



- 聊天问答
- 续写 / 改稿
- review
- 归档
- 计划 / 诊断

不同任务需要的目录类别和数量其实不一样。

### 5. review 子智能体还不够可合并

当前四个 review 子智能体已经有分工，但缺少统一的：

- 读取策略
- 证据强度
- 去重规则
- 严重度定义
- 报告预算
- 不确定性输出

结果是主线程只能拼接文本，不太像一个真正的体检报告。

### 6. compaction 已经可用，但还能更偏向“作者决策”

现有压缩已经保留了用户纠正、偏好、禁区、已确认事实、关键对象、工具结果和未完成任务。真正值得补的是：

- 更明确保留最后一次拍板
- 更明确标出被推翻的假设
- 更明确标出当前章节目标

这不是要重做 compaction，而是做小说场景的微调。

### 7. 直存正文不是纯 prompt 问题

是否允许直存正文，已经受到工具 registry 和工作流 gating 影响。也就是说，`proposalOnly` / `write_file` / `edit_file` / `propose_file_change` 这些行为，不是单靠 prompt 文本就能完全改掉的。

## 推荐方案

### 方案 A：抽共享规则片段，做单一事实源

建议新增内部模块，例如：

```ts
packages/novel-guide/src/prompts/novelRules.ts
```

把核心规则拆成可复用片段：

- `FILE_TRUTH_RULES`
- `DRAFT_POLICY_RULES`
- `LG_CONTENT_DIRECTORY_RULES`
- `REVIEW_SEMANTICS_RULES`
- `WRITE_REPORTING_RULES`

原则是：

- system prompt 保留总原则
- workflow prompt 复用规则片段
- 工具 description 只保留能力边界和少量必要提示
- 不要在多个地方手写同义文本

### 方案 B：把每轮 prompt 改成固定骨架

建议把 `buildPrompt()` 改成四段：

1. 本轮任务
2. 高优先级上下文
3. 项目导航
4. 执行规则

示意：

```text
# 本轮任务
- 书籍：...
- 工作流：continue / revise / plan / diagnose / none
- 是否允许写入：...
- 期望产物：回复 / 提案 / 实际写入 / 检查报告

# 高优先级上下文
- 用户显式引用
- 用户最新纠正
- 回复约束
- 已选技能

# 项目导航
- 这些是路径和摘要，不是完整事实
- 涉及判断或修改前必须读取文件

# 执行规则
- 文件事实高于索引摘要和旧对话
- 本轮用户明确要求高于默认工作流规则
- 不足以执行时只问最小必要问题
```

### 方案 C：给已有 session 加轻量 UI thread delta

不要完整恢复 `threadMessages`，也不要完全丢弃。建议新增一个很小的增量摘要，只保留：

- 用户明确纠正
- 用户拍板的设定
- 用户改变任务目标
- 上一轮 assistant 的未完成承诺

这部分可以按最近 2-4 条消息或固定 token 预算截断。

### 方案 D：按任务裁剪项目上下文

建议引入：

```ts
type PromptTaskMode = "chat" | "continue" | "revise" | "review" | "archive" | "plan" | "diagnose"
```

先做简单版，不必上复杂检索，只要按目录类别和数量裁剪即可：

- `chat`：少量索引 + thread delta
- `continue/revise`：章节大纲、正文、drafts、人物、世界观优先
- `review`：范围、维度、相关章节、canon 路径优先
- `archive`：canon / candidates / inbox 优先
- `plan/diagnose`：卷纲、章节大纲、剧情管理优先

### 方案 E：升级 review 子智能体

建议四个 review agent 共享一段 `REVIEW_AGENT_BASE_PROMPT`，再叠加各自维度。

共享规则建议：

```text
你是只读评审员。不要改文件。不要凭索引摘要直接下结论。

读取策略：
1. 先读 NOVEL.md / GUIDE.md。
2. 根据检查范围定位章节、大纲、canon 和 LG 内容目录。
3. 每个 issue 必须有至少一条文件证据；证据不足放入 questions。

严重度：
- high：会直接破坏理解、正典一致性、因果或主线承诺。
- medium：明显削弱效果，但作者可能有意为之。
- low：局部瑕疵、建议性优化。

输出限制：
- issues 最多 10 条
- 合并同源重复问题
- 不输出完整正文
```

建议 schema 扩展为：

```json
{
  "summary": "一句话结论",
  "coverage": {
    "read": ["实际读取的关键路径"],
    "notRead": ["因范围或缺失未读取但可能相关的路径"],
    "confidence": "low|medium|high"
  },
  "issues": [
    {
      "type": "...",
      "severity": "low|medium|high",
      "confidence": "low|medium|high",
      "message": "问题描述",
      "evidence": [{"path": "文件路径", "line": 1, "excerpt": "短证据"}],
      "whyItMatters": "为什么重要",
      "suggestion": "建议"
    }
  ],
  "questions": ["证据不足时需要作者确认的问题"],
  "nextActions": ["下一步建议"]
}
```

### 方案 F：compaction 只做小说化微调

不要把 compaction 重新设计成通用摘要。现有结构已经够用，建议只补两点：

- 优先保留用户最后一次拍板
- 显式保留被推翻的假设和当前章节目标

可以考虑在压缩提示里更强调：

- 已确认事实
- 作者偏好和禁区
- 当前正在处理的文件
- 已完成变更
- 未完成任务

### 方案 G：增加少量 prompt eval cases

建议补几组行为测试，不必一开始做复杂自动评分：

1. LG 内容目录召回
   - `NOVEL.md/canon` 很空，但 LG 内容目录有角色文件
   - 期望：先读 LG 内容目录，不回答“缺少设定”

2. 续写默认走提案和 `drafts/`
   - `workflowAction = continue`
   - 期望：优先 `propose_file_change`

3. 明确要求直存正文时允许正文
   - 用户说“直接保存到章节正文”
   - 期望：不再过度拒绝

4. 已有 session 的最新纠正不丢失
   - session 里旧设定为 A，UI 里最新纠正为 B
   - 期望：本轮以 B 为准

5. review 证据不足时不编造 issue
   - 期望：输出 `questions` / `coverage.notRead`

6. compaction 保留用户拍板
   - 期望：压缩摘要保留最终决定，不保留被推翻版本

## 落地顺序

### 第一阶段：收敛规则

1. 新增共享规则片段模块。
2. 重写 `buildPrompt()` 的结构。
3. 减少 `LG_LEGACY_PROMPT`、`formatChapterDraftPolicy()`、工具 description 的同义重复。

### 第二阶段：升级 review

1. 增加 `REVIEW_AGENT_BASE_PROMPT`。
2. 扩展四个 review 子 agent schema。
3. 主线程合并 coverage、issues、questions，而不是只拼文本。

### 第三阶段：补 thread delta 和 compaction

1. 为已有 session 增加轻量 UI thread delta。
2. 微调 compaction，强调作者拍板和未完成任务。

### 第四阶段：按任务裁剪上下文

1. 引入 `PromptTaskMode`。
2. 按工作流选择索引类别。
3. 做 token 和行为回归测试。

## 结论

优先做规则收敛和 prompt 结构化。现有 compaction 已经是小说专用，不需要推翻重做。review 子智能体和上下文裁剪可以后续增强，但前提是核心规则先统一到少数几个来源里。
