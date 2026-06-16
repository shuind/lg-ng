# 当前长对话机制建模

本文建模的是当前 LG + Novel Guide 在“长对话”下的上下文、前端消息、agent session、压缩与流式持久化关系。目标是把现状讲清楚，方便后续决定怎么改。

## 1. 总体结构

当前系统里，同一条聊天线程实际有三层上下文：

```text
┌─────────────────────────────────────────────┐
│ LG 前端 / Thread UI                         │
│ - React state: messages / turns / threads    │
│ - 展示完整线程                               │
│ - 渲染 MessageBubble / ChatTranscript        │
└─────────────────────────────────────────────┘
                    │
                    │ 读写
                    ▼
┌─────────────────────────────────────────────┐
│ LG Server Thread Store                       │
│ - thread-messages.jsonl                      │
│ - thread-turns.jsonl                         │
│ - 记录 UI 线程消息、turn、事件、proposal 等   │
└─────────────────────────────────────────────┘
                    │
                    │ 每轮发送时构造 prompt
                    ▼
┌─────────────────────────────────────────────┐
│ Novel Guide Agent Session                    │
│ - AgentEngine.messages                       │
│ - Novel Guide session file                   │
│ - compaction memo                            │
│ - project context 临时注入                   │
└─────────────────────────────────────────────┘
```

这三层不是同一个东西：

- 前端看到的是 `thread-messages.jsonl` 对应的 LG UI 消息。
- Agent 真正带入模型的是 `AgentEngine.messages + projectContext + 当前用户请求 prompt`。
- Agent session 有自己的压缩机制，但 LG UI thread 没有长期 thread memory。

所以长对话后，用户“视觉上看到的上下文”和 agent“模型实际拥有的上下文”可能不一致。

---

## 2. 一轮普通发送的数据流

非流式发送大致如下：

```text
用户点击发送
  │
  ▼
apps/lg/lib/server/chat-service.ts
sendThreadMessageUnlocked()
  │
  ├─ listThreadMessages(...)
  │    读取当前线程之前的 UI 消息
  │
  ├─ createRunningTurn(...)
  │    写入 userMessage + running turn
  │
  └─ runNovelGuideAgent(...)
       │
       ▼
apps/lg/lib/server/novel-guide-agent.ts
runNovelGuideAgent()
  │
  ├─ loadSession(workspacePath, baseAgentSessionId)
  │
  ├─ session 存在：promptThreadMessages = []
  │
  ├─ session 不存在：promptThreadMessages = input.threadMessages ?? []
  │
  ├─ new AgentEngine({ initialMessages: session?.messages })
  │
  ├─ buildPrompt(...)
  │
  └─ engine.submitMessage(...)
       │
       ▼
packages/novel-guide/src/agent/engine.ts
AgentEngine.submitMessageEvents()
  │
  ├─ ensureSystemPrompt()
  ├─ compactMessagesIfNeeded()
  ├─ buildProjectContext()
  ├─ turnMessages = this.messages + projectContext + current user content
  ├─ queryEvents(...)
  ├─ this.messages = result.messages after strip project context + change memo
  └─ saveSession(...)
```

成功后，LG server 会把 assistant message 写回 `thread-messages.jsonl`：

```text
Agent result
  │
  ├─ reply
  ├─ usage
  ├─ toolTrace / failedTools
  ├─ fileChanges / proposals
  └─ contextWindow
       │
       ▼
createAssistantMessage(...)
appendThreadMessages(bookId, [assistantMessage])
```

---

## 3. 当前 prompt 构造模型

`apps/lg/lib/server/novel-guide-agent.ts` 里的 `buildPrompt()` 当前结构：

```ts
function buildPrompt(input: {
  bookId: string
  bookTitle: string
  userMessage: string
  threadMessages: Message[]
  references: ChatReference[]
  responseConstraints: AppliedResponseConstraint[]
  skills: SkillSummary[]
  workflowAction?: WorkflowAction
}): string {
  return [
    `LG 书籍：${input.bookTitle} (${input.bookId})`,
    formatChapterDraftPolicy(),
    formatWorkflowAction(input.workflowAction),
    formatResponseConstraints(input.responseConstraints),
    formatSkillSummaries(input.skills),
    formatThreadMessages(input.threadMessages),
    "用户请求：",
    input.userMessage,
    formatReferences(input.references),
  ].filter(Boolean).join("\n")
}
```

这意味着每一轮的用户 prompt 由以下部分组成：

1. 当前书籍 id / title。
2. 章节草稿优先策略。
3. 当前工作流动作，例如续写、改稿、诊断、计划。
4. 当前启用的 response constraints。
5. 当前选中的 skills 摘要。
6. 最近 UI 聊天消息。
7. 用户本轮输入。
8. 用户显式选中的引用。

其中，“最近 UI 聊天消息”来自：

```ts
function formatThreadMessages(messages: Message[]): string {
  const visible = messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-8)

  if (visible.length === 0) return ""

  const lines = visible.map((message) => {
    const label = message.role === "user" ? "用户" : "助手"
    return `### ${label}\n${clipThreadMessage(message.content, message.role)}`
  })

  return [
    "LG 前文对话：",
    "这些是本轮请求前可见的聊天消息；用于对话上下文，尤其保留用户纠正和已确定项目事实。",
    ...lines,
  ].join("\n")
}
```

并且单条消息会截断：

```ts
function clipThreadMessage(content: string, role: Message["role"]): string {
  const maxLength = role === "assistant" ? 2400 : 1600
  const normalized = content.trim()
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}\n...[截断]`
    : normalized
}
```

关键结论：

- LG prompt 层最多显式带最近 8 条 UI 消息。
- assistant 最多 2400 字符。
- user 最多 1600 字符。
- 如果 agent session 存在，则这 8 条也不会带入，因为：

```ts
const session = await loadSession(workspacePath, baseAgentSessionId)
const promptThreadMessages = session ? [] : input.threadMessages ?? []
```

即：

```text
agent session 存在
  -> 依赖 agent session 自己的 messages / compaction
  -> 不额外带 LG UI threadMessages

agent session 不存在
  -> 使用 LG UI 最近 8 条消息恢复一点上下文
```

---

## 4. 当前 AgentEngine 上下文模型

`AgentEngine` 内部核心状态：

```ts
private readonly sessionId: string;
private messages: ChatCompletionMessageParam[];
private readonly tools: Tools;
private compaction?: SessionCompactionState;
```

构造时：

```ts
constructor(private readonly config: EngineConfig) {
  this.sessionId = config.sessionId ?? createSessionId();
  this.messages = stripProjectContextMessages(config.initialMessages ?? []);
  this.compaction = config.initialCompaction;
  this.tools = getTools({ readonlyOnly: config.readonlyOnly, proposalOnly: config.proposalOnly });
}
```

注意：初始化时会去掉 project context：

```ts
this.messages = stripProjectContextMessages(config.initialMessages ?? []);
```

这是为了避免 project context 被永久写入 session，导致每轮重复累积。

每轮执行时：

```ts
await this.ensureSystemPrompt();
await this.compactMessagesIfNeeded(options.signal);

const projectContext = await this.buildProjectContext();
const content = options.systemMeta
  ? prompt
  : `用户请求：\n${prompt}`;
const turnMessages: ChatCompletionMessageParam[] = [
  ...withProjectContext(this.messages, projectContext),
  { role: "user", content },
];
```

也就是说：

```text
持久 session messages
  + 本轮临时 project context
  + 本轮用户 prompt
  = 实际发给模型的 turnMessages
```

模型返回后：

```ts
this.messages = appendChangeMemo(
  stripProjectContextMessages(result.messages),
  buildChangeMemo(result.fileChanges, result.proposals),
);
```

保存 session 时：

```ts
const state: SessionState = {
  id: this.sessionId,
  cwd: this.config.cwd,
  messages: this.messages,
  compaction: this.compaction,
  updatedAt: new Date().toISOString(),
};
await saveSession(state);
```

关键结论：

- project context 每轮临时注入，不作为长期 session 存储。
- change memo 会追加进 session。
- compaction memo 会作为 system message 留在 session。
- agent session 和 LG UI thread 是分离的。

---

## 5. 当前压缩模型

当前压缩入口：

```ts
private async compactMessagesIfNeeded(signal?: AbortSignal): Promise<void> {
  if (this.messages.length <= 1) return;

  const budget = this.config.contextBudgetTokens ?? contextBudgetForModel(this.config.model);
  const triggerRatio = this.config.compactionTriggerRatio ?? DEFAULT_COMPACTION_TRIGGER_RATIO;
  if (estimateMessagesTokens(this.messages) <= budget * triggerRatio) return;

  const systemMessage = this.messages[0];
  const rest = this.messages.slice(1);
  const existingMemos = rest.filter(isCompactionMemo);
  const compactableMessages = rest.filter((message) => !isCompactionMemo(message));
  const recentCount = this.config.recentMessageCount ?? DEFAULT_RECENT_MESSAGE_COUNT;
  const targetRecentStart = Math.max(0, compactableMessages.length - recentCount);
  const recentStart = findSafeRecentStart(compactableMessages, targetRecentStart);
  const compacted = compactableMessages.slice(0, recentStart);
  const recent = compactableMessages.slice(recentStart);
  if (compacted.length < 4 || recent.length === 0) return;

  const summary = await this.summarizeForCompaction(compacted, signal);
  const memo: ChatCompletionMessageParam = {
    role: "system",
    content: [
      COMPACTION_PREFIX,
      `updated_at: ${new Date().toISOString()}`,
      "",
      summary.trim(),
    ].join("\n"),
  };
  this.messages = [systemMessage, ...existingMemos, memo, ...recent];
  this.compaction = {
    lastCompactedAt: new Date().toISOString(),
    originalMessageCount: rest.length + 1,
    compactedMessageCount: this.messages.length,
  };
}
```

当前默认值：

```ts
const DEFAULT_CONTEXT_BUDGET_TOKENS = 128000;
const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.85;
const DEFAULT_RECENT_MESSAGE_COUNT = 24;
```

模型预算判断：

```ts
function contextBudgetForModel(model: string): number {
  const normalized = model.toLowerCase();
  if (normalized.includes("mimo")) return 128000;
  if (normalized.includes("deepseek")) return 128000;
  return DEFAULT_CONTEXT_BUDGET_TOKENS;
}
```

压缩摘要生成：

```ts
private async summarizeForCompaction(
  messages: ChatCompletionMessageParam[],
  signal?: AbortSignal,
): Promise<string> {
  const rendered = messages.map(renderMessageForCompaction).join("\n\n").slice(0, 120_000);
  const response = await createChatCompletion({
    client: this.config.client,
    model: this.config.model,
    messages: [
      {
        role: "system",
        content: "为后续连续性总结此前工作区智能体对话。保留用户目标、决策、文件路径、工具结果、未解决任务和重要约束；不要编造。",
      },
      { role: "user", content: rendered },
    ],
    temperature: 0.1,
    maxTokens: 1400,
    timeoutMs: 60000,
    signal,
  });
  return stringifyMessageContent(response.message.content) || "未生成历史上下文摘要。";
}
```

当前压缩行为可以概括为：

```text
如果 AgentEngine.messages 估算 tokens <= 128000 * 0.85
  -> 不压缩

如果超过阈值
  -> 保留 primary system message
  -> 保留已有 compaction memos
  -> 把旧的非 memo 消息压缩成一个新的 compaction memo
  -> 保留最近 24 条非 memo 消息
```

潜在问题：

1. 触发较晚：约 108k tokens 才触发。
2. 一次压缩量可能很大。
3. 120k 字符压成 1400 tokens，信息损失可能明显。
4. 旧 compaction memo 不合并，会逐渐累积。
5. 压缩判断只看 `this.messages`，不看 `projectContext + 当前 prompt` 组成后的真实 `turnMessages`。

---

## 6. 当前 contextWindow 小圈模型

后端 `AgentEngine` 提供：

```ts
getContextWindowState(messages: ChatCompletionMessageParam[] = this.messages): EngineContextWindowState {
  const budgetTokens = this.config.contextBudgetTokens ?? contextBudgetForModel(this.config.model);
  const estimatedTokens = estimateMessagesTokens(messages);
  return {
    estimatedTokens,
    budgetTokens,
    ratio: budgetTokens > 0 ? estimatedTokens / budgetTokens : 0,
    triggerRatio: this.config.compactionTriggerRatio ?? DEFAULT_COMPACTION_TRIGGER_RATIO,
    lastCompactedAt: this.compaction?.lastCompactedAt,
  };
}
```

该值会随着 assistant message 写入：

```ts
contextWindow: result.contextWindow
```

前端取值：

```ts
const contextWindow = useMemo(
  () => [...messages].reverse().find((message) => message.role === "assistant" && message.contextWindow)?.contextWindow ?? estimateThreadContextWindow(messages),
  [messages],
)
```

fallback 估算：

```ts
function estimateThreadContextWindow(messages: Message[]): MessageContextWindow {
  const estimatedTokens = Math.max(1, Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / 2.4))
  const budgetTokens = 128000
  return {
    estimatedTokens,
    budgetTokens,
    ratio: estimatedTokens / budgetTokens,
    triggerRatio: 0.85,
  }
}
```

当前小圈语义：

```text
优先显示最后一条 assistant message 上携带的 agent contextWindow
如果没有，则用前端全部 UI messages 粗略估算
```

注意：

- 后端 contextWindow 默认统计的是 `AgentEngine.messages`，不是完整 `turnMessages`。
- 前端 fallback 统计的是全部 UI messages，但 agent 不一定吃全部 UI messages。
- 用户当前正在输入的内容没有提前计入。
- selected references / skills / response constraints 对本轮 prompt 的影响没有提前计入。

所以当前小圈更像“历史状态灯”，不是严格的“如果现在发送会占用多少上下文”。

---

## 7. 当前前端渲染模型

聊天渲染核心在 `apps/lg/components/lg/chat-panel/message-rendering.tsx`。

它使用虚拟列表：

```tsx
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => scrollRef.current,
  getItemKey: (index) => {
    const row = rows[index]
    return row?.type === "message" ? row.message.id : `activity:${streamingTurnId ?? "pending"}`
  },
  estimateSize: () => 160,
  overscan: 6,
})
```

流式 assistant 单独作为 live tail：

```tsx
const streamingTurnId = runningTurn?.id ?? null
const liveAssistant = streamingTurnId
  ? messages.find((message) => message.role === "assistant" && message.turnId === streamingTurnId)
  : undefined
```

普通消息列表会过滤掉 streaming assistant：

```tsx
const virtualMessages = useMemo(
  () => streamingTurnId
    ? messages.filter((message) => !(message.role === "assistant" && message.turnId === streamingTurnId))
    : messages,
  [messages, streamingTurnId],
)
```

再 map 成 rows：

```tsx
const rows = useMemo<Array<{ type: "message"; message: Message }>>(
  () => virtualMessages.map((message) => ({ type: "message" as const, message })),
  [virtualMessages],
)
```

这说明 DOM 渲染有虚拟化，长对话不会直接把所有 message DOM 都挂上去。  
但 React state 仍然持有完整 `messages`，并且每次 messages 更新会重新做部分 filter/map/find/reduce。

潜在长对话成本：

- `messages` 数组本身越来越大。
- 每条 message 可能含有长 content、events、brief、changeSet、proposalSet。
- markdown 长内容仍可能 parse 成本高。
- streaming 时 live assistant 内容频繁变化，相关组件频繁重算。
- 小圈 fallback 会 reduce 全量 message content。

---

## 8. 当前 streaming 持久化模型

流式发送时，`chat-service.ts` 会创建 progress message：

```ts
const progressMessage: Message = {
  id: progressMessageId,
  threadId: thread.id,
  turnId: turn.id,
  role: "assistant",
  content: assistantContent,
  version: 1,
  createdAt: turn.createdAt,
  events: [...events],
}
await appendThreadMessages(bookId, [progressMessage]).catch(() => {})
```

这个函数会被节流调用：

```ts
if (!force && now - lastProgressWriteAt < 750) {
  progressWritePending = true
  return
}
```

也就是说，流式输出过程中可能每隔约 750ms append 一条同 id 的 assistant progress message 到 `thread-messages.jsonl`。

当前模型：

```text
streaming 开始
  -> append 空/初始 assistant progress message
streaming 输出中
  -> 周期性 append 同 id 的 progress message
streaming 完成
  -> append 最终 assistant message
```

潜在问题：

- JSONL 文件会随着 streaming 输出不断膨胀。
- 如果读取层靠 id 做 dedupe，那么 UI 看起来可能正常，但 IO/parse 成本仍增长。
- 如果 dedupe 不完整，可能出现重复 assistant message。
- 长对话 + 多次长 streaming 后，`thread-messages.jsonl` 会有大量历史中间态。

---

## 9. 当前 sub-agent 模型

主 agent 调子 agent 时：

```ts
private createToolContext(permissionCache: Map<string, boolean>, signal?: AbortSignal): ToolContext {
  return {
    cwd: this.config.cwd,
    signal,
    permissionMode: this.config.permissionMode ?? "bypass",
    askConfirmation: this.config.askConfirmation,
    permissionCache,
    runAgent: async ({ agent, prompt, readonly }) => {
      const result = await this.runSubAgent({ agent, prompt, readonly });
      return result.text;
    },
  };
}
```

`runSubAgent()` 会新建一个独立 engine：

```ts
const subEngine = new AgentEngine({
  cwd: this.config.cwd,
  client: this.config.client,
  model: this.config.model,
  askConfirmation: this.config.askConfirmation,
  permissionMode: this.config.permissionMode,
  maxLoops: Math.min(this.config.maxLoops ?? DEFAULT_MAX_LOOPS, DEFAULT_SUBAGENT_MAX_LOOPS),
  readonlyOnly: input.readonly === true,
  appendSystemPrompt: `你正在作为子智能体 ${agent.name} 运行。默认拥有完整工具权限；如果任务要求只读，不要改文件。`,
});
return await subEngine.submitMessage(`${agent.prompt}\n\n# 任务\n${input.prompt}`, {
  save: false,
  systemMeta: true,
});
```

关键结论：

- 子 agent 默认不继承主 agent 的 `this.messages`。
- 子 agent 不继承主 agent 的 compaction memo。
- 子 agent 不继承 LG thread memory，因为当前没有 thread memory。
- 子 agent 只能看到传给它的 prompt、自身 agent prompt、系统 prompt、临时 project context。

长对话里，如果主 agent 没有把用户长期约束/前文纠错转述进子 agent prompt，子 agent 容易断层。

---

## 10. 当前长对话风险地图

### 10.1 上下文一致性风险

```text
UI 完整历史
  ≠ LG prompt 最近 8 条
  ≠ AgentEngine session messages
  ≠ Agent compaction summary
  ≠ 子 agent prompt
```

用户以为“我上面说过”，但系统可能只有其中一层记得。

### 10.2 压缩信息损失风险

```text
约 108k tokens 历史
  -> 截取 120k 字符
  -> 生成 1400 tokens summary
```

容易丢：

- 用户纠错；
- 禁止事项；
- 已废弃设定；
- 未完成任务；
- 分支决策；
- 文件路径和修改原因；
- 用户对输出风格的长期要求。

### 10.3 真实预算不可见风险

小圈显示的不是完整本轮模型输入。  
真实输入还包括：

- project context；
- 当前 user prompt；
- references；
- skills；
- response constraints；
- workflow action；
- 可能的 LG recent thread messages。

这些当前没有被小圈提前完整统计。

### 10.4 文件膨胀风险

`thread-messages.jsonl` 可能因为 streaming progress append 同 id message 而膨胀。

长对话后会影响：

- 线程读取；
- JSONL parse；
- 前端 messages state；
- 分支路径计算；
- fork/copy 操作。

### 10.5 分支/恢复风险

长对话中存在：

- thread path；
- turn parent path；
- baseAgentSessionId；
- agentSessionId；
- session compaction。

这些路径如果不一致，可能造成 UI 分支和 agent session 记忆不一致。

---

## 11. 当前系统的强点

当前不是完全没有长对话设计，已经有一些保护：

1. Agent session 有 compaction。
2. project context 临时注入，不永久污染 session。
3. 前端聊天列表有 virtualizer，避免所有消息 DOM 同时渲染。
4. assistant message 携带 contextWindow，前端能显示上下文使用情况。
5. fork/parentTurnPath 已有路径概念，不是简单线性消息。
6. response constraints / skills / references 是结构化传入 prompt 的。

问题主要是这些保护没有形成统一的“长对话状态模型”。

---

## 12. 建议的目标模型

建议把当前三层扩展成四层：

```text
┌─────────────────────────────────────────────┐
│ LG UI messages                              │
│ 完整展示、可分支、可回看                    │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Thread Memory                               │
│ 每个 thread 的长期摘要                       │
│ - 用户偏好                                  │
│ - 已确认事实                                │
│ - 用户纠错                                  │
│ - 禁止事项                                  │
│ - 当前目标                                  │
│ - 未完成任务                                │
│ - 最近决策                                  │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Turn Prompt                                 │
│ thread memory + 当前约束 + 当前引用 + 用户输入 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Agent Session                               │
│ 模型原生 messages + rolling compaction       │
└─────────────────────────────────────────────┘
```

核心变化：

1. UI messages 负责完整记录和展示。
2. Thread memory 负责长期语义连续性。
3. Agent session 负责工具调用和模型内部连续性。
4. 小圈显示真实 turn prompt 预算，而不是只显示历史 session。

---

## 13. 建议优先级

### P0：加 Thread Memory

新增每个 thread 的长期摘要。每轮 prompt 都带入。  
它应该独立于 agent session，因为 UI thread 是产品层真实对话。

建议字段：

```ts
interface ThreadMemory {
  threadId: string
  updatedAt: string
  summary: string
  userPreferences: string[]
  confirmedFacts: string[]
  corrections: string[]
  activeConstraints: string[]
  rejectedAssumptions: string[]
  openTasks: string[]
  recentDecisions: string[]
}
```

### P1：改 Agent Compaction

建议：

- 旧 memo 合并成 rolling memo，不无限堆叠。
- summary 从 1400 tokens 提到 2500-4000。
- 提前触发压缩，例如 0.65-0.75。
- summary 输出结构化章节：
  - 用户目标；
  - 已确认事实；
  - 用户纠错；
  - 禁止事项；
  - 文件路径；
  - 工具结果；
  - 未完成任务；
  - 废弃设定。

### P2：改 Context Window 预估

新增“本轮发送前估算”：

```text
agent session messages
+ project context
+ thread memory
+ response constraints
+ selected skills
+ selected references
+ current user input
```

前端小圈显示这个估算，才符合用户直觉。

### P3：streaming 中间态不要写爆 JSONL

建议：

- streaming 中间态放内存或临时 store；
- 主 `thread-messages.jsonl` 最终只 append 一条 assistant message；
- 如果要恢复刷新中的 streaming，再设计单独 volatile event log。

### P4：sub-agent 继承必要上下文

子 agent prompt 自动附加：

- thread memory；
- 当前用户目标；
- 当前约束；
- 当前引用；
- 主 agent compacted summary 的精简版。

---

## 14. 一句话结论

当前长对话问题的本质是：

> 系统已经有 agent 级上下文压缩，但没有产品级 thread memory；前端完整历史、LG prompt 最近消息、agent session、sub-agent prompt 四者没有统一建模，导致对话越长越容易出现上下文断层、压缩信息损失、UI 状态膨胀和预算显示偏差。
