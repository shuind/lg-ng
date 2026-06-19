# Compaction and Memory Design

本文记录 LG / Novel Guide 后续长对话压缩与产品级记忆的目标设计。

核心结论：

- `compaction` 负责当前 agent session 的连续性。
- `memory` 负责用户长期协作偏好，让产品越用越顺手。
- 项目事实不进 memory，仍以真实文件为准。
- 不再推荐当前这种每轮自动更新的 `Thread Memory`。

## 1. 分层模型

运行时上下文应拆成四层：

```text
Stable Prefix
  system prompt
  LG legacy 规则

Dynamic User Preference
  用户明确保存的轻量 memory

Session State
  单个 merged NG_COMPACTION_MEMO
  recent raw messages
  NG_CHANGE_MEMO（仅未压缩阶段的最近增量）

Current Turn
  LG 书籍
  工作流 action
  回复约束
  已选技能
  当前用户请求
  用户选中的引用
```

原则：

- 稳定内容放前面，尽量提高 prompt cache 命中。
- 动态状态放稳定前缀之后。
- 当前用户请求和本轮引用保持原文，不做自动压缩。
- 项目事实、设定、剧情、章节正文以文件为准，不能把 memory 当事实来源。

## 2. Compaction

`NG_COMPACTION_MEMO` 是 agent session 的 checkpoint，不是产品级记忆。

它的职责是让长线程在丢弃旧消息原文后仍能继续工作：

- 保留用户目标、明确纠正、偏好、禁止事项。
- 保留已确认事实和已废弃假设。
- 保留关键文件、章节、设定、角色、工具结果。
- 保留已完成工作、未完成任务、当前状态和下一步。

### 2.1 目标结构

session 中只保留一个有效 memo：

```text
system
NG_COMPACTION_MEMO
recent user / assistant / tool messages
```

`NG_CHANGE_MEMO` 不在 full compact 后独立保留。它只用于正常未压缩对话中逐轮注明上一轮文件变更，帮助模型在 append-only 阶段维持连续性和缓存命中。触发 full compact 后，旧 change memo 应和旧消息一起被吸收到新的 `NG_COMPACTION_MEMO`，压缩后的 session 从新的 memo 和 recent messages 重新开始。

不推荐长期累积多个 memo：

```text
system
memo_1
memo_2
memo_3
recent messages
```

### 2.2 合并策略

full compact 时，把旧 memo 和待压缩旧消息一起输入 compactor：

```text
old NG_COMPACTION_MEMO
+ old compactable messages
-> new merged NG_COMPACTION_MEMO
```

然后替换为：

```text
system
new merged NG_COMPACTION_MEMO
recent messages
```

这样 memo 数量稳定，避免多次压缩后上下文越来越碎。

### 2.3 最近原文窗口

full compact 后只保留最近 2~5 条原始消息（user/assistant/tool），其余全部压缩进 NG_COMPACTION_MEMO，因为最近消息里常有：

- 用户最新纠正。
- 当前任务细节。
- 刚读到的文件结果。
- 刚完成或失败的工具调用。

这些内容用摘要替代容易失真。

最近窗口应放在 session state 里，不要放进稳定前缀。

### 2.4 Tool Result Microcompact

工具结果可以先做轻量 microcompact，再考虑 full compact。

适合 microcompact 的内容：

- 很长的 read/search/list 输出。
- 旧的工具结果。
- 已经不在最近窗口内的机械性大文本。

microcompact 应保留：

- 工具名。
- 目标路径或查询。
- 成功/失败状态。
- 原始长度和估算 token。
- 关键预览或结构化摘要。

不要把用户决策、用户纠正、当前任务意图当成普通工具输出压掉。

### 2.5 触发策略

不要每轮重写 memo。

推荐策略：

1. 平时 append-only。
2. 接近预算时先 microcompact 旧工具结果。
3. 仍超过阈值时 full compact。
4. full compact 只在阈值触发或用户手动触发时执行。
5. compact 请求本身过长时，按消息组丢弃最旧组并记录边界。

需要记录 metadata：

```ts
interface CompactionBoundary {
  id: string
  createdAt: string
  strategy: "microcompact" | "full-summary"
  tokenBefore: number
  tokenAfter: number
  compactedMessageRange?: { start: number; end: number }
  preservedRecentMessageRange?: { start: number; end: number }
  droppedMessageGroups?: Array<{
    startIndex: number
    endIndex: number
    messageCount: number
    reason: "prompt_too_long"
  }>
}
```

## 3. Memory

产品级 memory 的目标不是保存线程摘要，而是保存用户长期协作偏好。

它只回答一个问题：

```text
这个用户希望产品以后怎样配合他？
```

### 3.1 不再推荐 Thread Memory

不推荐当前每轮成功后自动更新的 `Thread Memory`：

- 每轮额外增加一次模型调用。
- 用户不可见，容易形成隐藏状态。
- 和 `NG_COMPACTION_MEMO` 职责重叠。
- 可能破坏 prompt cache 前缀。
- 容易把项目事实、线程进度、用户偏好混在一起。

删除或弃用方向：

- 不再每轮调用 `mergeThreadMemoryAfterTurn()`。
- 不再以 thread 为单位维护隐藏长期记忆。

## 4. User Memory

新的 memory 应是轻量、通用、用户可控的偏好层。

### 4.1 存什么

可以保存：

- 用户沟通偏好。
- 用户工作流偏好。
- 用户写作/改稿偏好。
- 用户明确纠正。
- 用户明确禁止事项。
- 用户希望长期保留的默认行为。

不保存：

- 项目事实。
- 剧情设定。
- 章节正文。
- 普通聊天总结。
- 临时任务进度。
- 未经用户确认的模型推断。

示例：

```text
- 回答先给结论，再给理由。
- 讨论架构时直接指出关键问题，不要客套。
- 小说改稿默认保守小改，除非明确要求重写。
- 不要自动维护隐藏记忆；新增长期记忆必须确认。
```

### 4.2 数据结构

保持轻结构，核心是自然语言 `text`：

```ts
interface UserMemoryItem {
  id: string
  text: string
  enabled: boolean
  scope: "global" | "book"
  tags: string[]
  source?: {
    threadId: string
    messageIds: string[]
  }
  createdAt: string
  updatedAt: string
}
```

说明：

- `text` 是唯一必须让模型理解的内容。
- `tags` 只用于展示和相关性筛选，不作为严格 schema。
- `scope` 控制全局生效或当前书籍生效。
- `enabled=false` 表示保留但不注入 prompt。

### 4.3 用户交互

主入口建议使用按钮，而不是只依赖 slash 命令。

原因：

- 记忆需要透明可控。
- 按钮可以直接打开可视化面板。
- 用户能看到当前有哪些 memory 正在影响模型。

Memory 面板包含：

```text
已保存
候选
从最近对话提炼
手动新增
```

每条 memory 支持：

```text
编辑 / 删除 / 暂停 / 修改 scope
```

### 4.4 更新方式

memory 不自动每轮更新。

推荐两种更新方式：

1. 手动新增。
2. 用户触发 memory extractor agent，从最近消息提炼候选。

流程：

```text
用户点击 Memory / 记住 / 从最近对话提炼
  -> 后台 extractor 读取最近 N 条消息
  -> 生成候选 memory
  -> 用户确认、编辑或删除
  -> 保存 enabled memory
```

extractor 只生成候选，不直接写正式 memory。

候选输出示例：

```json
[
  {
    "text": "用户讨论架构时希望先指出关键问题，再展开方案。",
    "reason": "最近多次要求直接解释设计取舍。",
    "tags": ["communication", "architecture"]
  }
]
```

用户确认后才保存。

### 4.5 Prompt 注入

注入内容应简短、透明、低优先级于本轮请求：

```text
用户保存的长期偏好：
以下内容只影响协作方式和默认行为；不覆盖本轮明确请求，不作为项目事实。
- ...
```

注入位置：

```text
Stable Prefix
User Memory
Session State
Current Turn
```

如果 memory 很少，可以全量注入 enabled memory。

如果 memory 变多，应按当前请求相关性选取少量条目，例如 5-10 条，并在 UI 中可查看哪些 memory 被使用。

## 5. 删除和可控性

用户必须能掌控 memory：

- 查看全部 memory。
- 查看当前轮使用了哪些 memory。
- 暂停单条 memory。
- 删除单条 memory。
- 禁用整个 memory 功能。

删除线程不应该留下用户看不见、仍可能生效的线程级 memory。

如果未来保留 thread-level 派生信息，删除线程时必须同步清理：

- thread memory。
- 对应 agent session。
- 由该线程产生但未提升为用户确认 memory 的候选。

## 6. 推荐落地顺序

第一阶段：

1. 移除或禁用每轮自动 `Thread Memory` 更新。
3. 调整 compaction：旧 memo 和旧消息合并成单个新 memo。
4. 保留 recent raw message window。

第二阶段：

1. 新增 `user-memory.json` 或等价 store。
2. 新增 Memory 面板。
3. 支持手动 CRUD。
4. 每轮只注入 enabled memory。

第三阶段：

1. 新增 memory extractor agent。
2. 支持从最近消息提炼候选。
3. 候选必须经过用户确认。
4. memory 变多后增加相关性筛选和“本轮使用的 memory”可视化。

## 7. 最终边界

目标边界：

```text
NG_COMPACTION_MEMO
  线程连续性，agent session 内部 checkpoint。

Recent Raw Messages
  最近语境保真，避免摘要丢失最新纠正和工具结果。

User Memory
  用户确认保存的长期协作偏好。

Project Files
  项目事实、剧情设定、章节正文和正典来源。
```

不要让某一层承担所有职责。

尤其不要让 memory 变成：

- 自动聊天总结。
- 项目事实缓存。
- 隐藏任务状态。
- 另一个 compaction memo。
