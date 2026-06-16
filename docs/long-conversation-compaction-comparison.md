# 长对话压缩机制对比报告：LG / Novel Guide vs Codex vs Claude Code

本文对比当前 LG + Novel Guide 的长对话机制与同级目录下 `codex`、`claude-code-main` 两套实现中的上下文压缩设计。目标不是复刻它们，而是找出当前系统最该补的能力边界。

## 1. 当前 LG / Novel Guide 的状态

当前系统已经有 agent 级压缩，但它更像“单个 AgentEngine 的消息保底机制”，还不是完整的产品级长对话系统。

现状可以概括为四点：

1. **UI 线程与 agent session 分离**
   - LG 前端展示完整 `thread-messages.jsonl`。
   - Agent 真正吃的是 `AgentEngine.messages + projectContext + 当前 prompt`。
   - 如果 agent session 存在，本轮不会额外带入 LG UI 最近 8 条消息。

2. **压缩只发生在 AgentEngine.messages 层**
   - 默认预算约 128k tokens。
   - 触发阈值是 0.85，即约 108k tokens。
   - 保留 system message、已有 compaction memo、新 memo、最近 24 条非 memo 消息。
   - 旧消息渲染后最多取 120k 字符，总结成约 1400 tokens。

3. **没有 thread-level memory**
   - UI thread 是产品层真实对话，但没有独立的长期语义摘要。
   - 用户纠正、偏好、禁止事项、已确认事实主要依赖 agent session 留存或压缩摘要侥幸保留。

4. **context window 指示不是“本轮真实输入预算”**
   - 后端统计多为 `AgentEngine.messages`。
   - 前端 fallback 统计 UI messages。
   - 都没有完整纳入当前输入、references、skills、constraints、workflow action、project context。

所以当前问题不是“完全没有压缩”，而是：**压缩层级太单一，产品线程、agent session、前端展示、子 agent prompt 没有统一的长期上下文模型。**

---

## 2. Codex 的压缩模型

Codex 的压缩实现更接近“会话历史替换 + handoff checkpoint”。关键文件：

- `codex/codex-rs/core/src/compact.rs`
- `codex/codex-rs/core/src/compact_remote.rs`
- `codex/codex-rs/core/src/compact_remote_v2.rs`
- `codex/codex-rs/core/templates/compact/summary_prefix.md`
- `codex/codex-rs/core/templates/compact/prompt.md`
- `codex/codex-rs/core/src/state/auto_compact_window.rs`

### 2.1 核心机制

Codex local compaction 会：

1. 克隆当前 session history。
2. 把 compact prompt 作为一次模型请求发出。
3. 从 compact turn 的最后 assistant message 中拿到 summary。
4. 拼接固定 `SUMMARY_PREFIX`。
5. 构造新的 replacement history。
6. 用 `replace_compacted_history()` 替换原 history。
7. 重新计算 token usage。
8. 向用户发 warning：长线程和多次压缩会降低准确性，建议开启新线程。

它的 summary prefix 明确写着：

> You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

也就是说，Codex 把压缩定义成“另一个 LLM 接手任务”的 checkpoint，而不是单纯把旧消息揉短。

### 2.2 自动与手动压缩

Codex 区分：

- manual compaction：用户主动触发；
- auto compaction：系统根据窗口自动触发；
- mid-turn / pre-turn 行为差异：通过 `InitialContextInjection` 控制 initial context 是否注入到替换历史中。

`InitialContextInjection` 很关键：

- `DoNotInject`：手动或 pre-turn 压缩后清掉 reference context，下个普通 turn 再完整注入 initial context。
- `BeforeLastUserMessage`：mid-turn 压缩时，把 initial context 插到最后真实 user message 前，符合模型训练期望。

这说明 Codex 不只是“总结旧消息”，还处理压缩后历史结构与初始上下文注入位置。

### 2.3 失败恢复

Codex local compaction 在 compact 请求本身超上下文时，会从 history 开头删除最旧 item 并重试：

```text
ContextWindowExceeded during compact
  -> remove_first_item()
  -> retry
```

这比当前 LG 的固定 `slice(0, 120_000)` 更贴近真实 token 窗口，但也更明确地承认：压缩请求本身可能失败，需要有降级路径。

### 2.4 Remote v2

Codex remote v2 还有服务端 compact endpoint 风格：

- 在 prompt input 后追加 `ResponseItem::CompactionTrigger`。
- 服务端返回 compacted output。
- 本地再 build compacted history 并安装。
- 有 `RETAINED_MESSAGE_TOKEN_BUDGET = 64_000` 的保留消息预算。

这代表 Codex 正在把压缩从“普通总结请求”推进到“模型/服务端知道这是 compact 事件”的专用路径。

### 2.5 AutoCompactWindow

`AutoCompactWindow` 维护：

- window ordinal；
- prefill input token baseline；
- server-observed usage 优先于 estimated usage。

这比 LG 当前的小圈更细：它不只估算“总量”，还知道当前 compact window 的 baseline，用于计算窗口增长。

---

## 3. Claude Code 的压缩模型

Claude Code 的压缩系统明显比当前 LG 复杂，已经从单一 `/compact` 演进成多层上下文治理。关键文件：

- `claude-code-main/src/services/compact/autoCompact.ts`
- `claude-code-main/src/services/compact/compact.ts`
- `claude-code-main/src/services/compact/prompt.ts`
- `claude-code-main/src/services/compact/microCompact.ts`
- `claude-code-main/src/commands/compact/compact.ts`

### 3.1 Auto compact 阈值不是简单比例

Claude Code 不是用 `budget * 0.85` 这类比例触发，而是：

```text
effective context window
  = model context window - reserved summary output tokens

auto compact threshold
  = effective context window - 13k buffer
```

其中 summary 输出最多预留 20k tokens：

```ts
const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000
const AUTOCOMPACT_BUFFER_TOKENS = 13_000
```

这点非常重要：Claude Code 把“压缩本身也需要输出空间”算进去了。当前 LG 的压缩触发只看历史消息估算，没有显式为 summary 输出、当前 prompt、工具返回留 headroom。

### 3.2 Warning / error / blocking 分层

Claude Code 维护多档状态：

- warning threshold；
- error threshold；
- auto compact threshold；
- blocking limit；
- manual compact buffer。

当前 LG 的小圈只有 ratio / triggerRatio，表达能力弱很多。它告诉用户“用了多少”，但不能清楚区分：

- 只是接近上限；
- 应该建议压缩；
- 应该自动压缩；
- 已经必须阻止继续发送。

### 3.3 `/compact` 的优先级链路

Claude Code 手动 `/compact` 不是直接总结全部历史，而是：

1. 先尝试 session memory compaction。
2. 如果 reactive-only 模式开启，走 reactive compact。
3. 否则先 microcompact。
4. 再 traditional `compactConversation()`。
5. 成功后做 post compact cleanup、清缓存、重置 last summarized id、抑制刚压缩后的 warning。

这说明 Claude Code 把压缩拆成多个层级：

```text
session memory compaction
  -> microcompact
  -> full compact
  -> reactive compact fallback
  -> post compact cleanup
```

当前 LG 只有 full summary memo，缺少低成本的 microcompact 与更高层的 session/thread memory。

### 3.4 Microcompact：先清工具结果，不急着总结

`microCompact.ts` 会识别可压缩工具：

- Read
- Bash / shell
- Grep
- Glob
- WebSearch
- WebFetch
- Edit
- Write

并清理旧工具结果内容，用 marker 替代，例如：

```text
[Old tool result content cleared]
```

这类设计很适合 agent 型应用，因为长对话膨胀往往不是自然语言本身，而是工具输出、文件读取、搜索结果、日志、diff。

当前 LG / Novel Guide 没有类似 tool-result compaction。它直接对历史消息做文本总结，因此会把“可机械删除的冗余工具结果”和“必须语义保留的用户决策”混在一起处理。

### 3.5 Compact prompt 更强调继续开发所需信息

Claude Code 的 compact prompt 要求输出：

1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections
4. Errors and fixes
5. Problem Solving
6. All user messages
7. Pending Tasks
8. Current Work
9. Optional Next Step

它还特别要求关注：

- 用户明确请求；
- 用户反馈，尤其是“让你改做法”的反馈；
- 文件路径、函数签名、代码片段；
- 错误与修复过程；
- 当前正在做什么；
- 下一步必须直接符合最近用户请求。

相比之下，当前 LG 的 summary prompt 是：

```text
为后续连续性总结此前工作区智能体对话。保留用户目标、决策、文件路径、工具结果、未解决任务和重要约束；不要编造。
```

方向正确，但过短，且输出只有 1400 tokens。它不强制列出用户原话、错误修复、当前工作、下一步，因此容易在长对话里丢失“行为纠偏”和“任务边界”。

### 3.6 Prompt-too-long 的恢复策略

Claude Code 的 `compact.ts` 有 `truncateHeadForPTLRetry()`：

- 如果 compact 请求本身 prompt too long，按 API round group 删除最旧组；
- 如果无法解析 token gap，就删除约 20% group；
- 保证不能删到没有可总结内容；
- 如果删除后 assistant 开头，会补一个 synthetic user marker，避免 API 拒绝。

这比当前 LG 的固定字符截断更安全，因为它按 API round 分组保留消息结构，而不是从字符串层面裁剪。

---

## 4. 三者核心差异

| 维度 | 当前 LG / Novel Guide | Codex | Claude Code |
|---|---|---|---|
| 压缩层级 | AgentEngine messages | Session history replacement | Session memory / microcompact / full compact / reactive compact |
| 产品 thread memory | 无 | 主要是 session history | 有 session memory 方向 |
| 触发策略 | 估算 tokens > 128k * 0.85 | auto window / context usage | effective window - buffer，预留 summary 输出 |
| 摘要 prompt | 简短中文一句系统指令 | handoff checkpoint | 结构化 9 节，强调用户反馈和继续开发 |
| 压缩请求过长 | 先截 120k 字符 | 删除最旧 history item 重试 | 按 API round group 删除并重试 |
| 工具结果治理 | 无专门 microcompact | history item 级处理 | microcompact 清旧工具结果 |
| 压缩后结构 | system + old memos + new memo + recent | replacement history + compacted item | compact boundary + summary + preserved messages + attachments/hooks |
| 初始上下文注入 | project context 每轮临时注入 | 区分 DoNotInject / BeforeLastUserMessage | 通过 system/user context、cache params、post cleanup 管理 |
| 用户可见提示 | contextWindow 小圈 | compaction warning | warning/error/blocking/compact display |
| 多次压缩 | 旧 memo 累积 | replacement history | boundary / memory / cleanup 体系 |

---

## 5. 对当前文档建议的修正

现有 `docs/current-long-conversation-model.md` 的核心判断是对的：当前系统缺少产品级 thread memory，UI 历史、agent session、LG prompt、sub-agent prompt 存在断层。

但结合 Codex 和 Claude Code 后，建议把目标模型从“四层”进一步细化成“六层”：

```text
LG UI messages
  完整展示、分支、回看，不直接代表模型真实上下文

Thread Memory
  产品级长期语义，按 thread / branch 维护用户偏好、纠错、事实、目标、未完成任务

Turn Assembly
  本轮真实 prompt 组装层：thread memory + current input + references + constraints + skills + workflow action

Agent Session
  模型交互历史、工具调用历史、assistant reasoning continuity

Tool Result Store / Microcompact Layer
  对 Read/Grep/Bash/WebFetch 等高膨胀结果做结构化清理或外置引用

Compaction Boundary / Checkpoint
  可恢复的压缩边界，记录 summary、保留段、压缩时间、token before/after、下一步
```

也就是说，**Thread Memory 仍是 P0，但不应该把所有长对话问题都压到 Thread Memory 上。**

Thread Memory 负责“语义连续性”；Microcompact 负责“工具输出减肥”；Full compact 负责“历史替换”；Context Window 负责“真实预算可见”。

---

## 6. 建议的新优先级

### P0：新增 Thread Memory，但要结构化、可覆盖、可分支

Thread Memory 应独立于 agent session，因为 UI thread 是产品层真实对话。建议字段沿用现有文档，但增加 branch / source turn 信息：

```ts
interface ThreadMemory {
  threadId: string
  branchPath?: string[]
  updatedAt: string
  sourceTurnIds: string[]
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

关键点：

- 每轮 prompt 都带 thread memory。
- 新摘要不是 append-only，而是 merge/update。
- 用户纠正和禁止事项优先级高于普通 summary。
- fork/thread branch 时要复制或派生 memory，避免 UI 分支和 agent 记忆错位。

### P1：把当前 compaction prompt 改成结构化 checkpoint

当前 1400-token 简短 summary 太容易丢信息。建议改为类似 Claude Code 的结构：

```text
1. 用户目标与当前任务
2. 用户明确纠正 / 偏好 / 禁止事项
3. 已确认事实与已废弃假设
4. 文件、章节、设定、角色等关键对象
5. 工具调用和重要结果
6. 已完成工作
7. 未完成任务
8. 当前正在做什么
9. 下一步
```

同时建议把 maxTokens 从 1400 提到 2500-4000，并且压缩触发从 0.85 提前到 0.65-0.75。

原因：Claude Code 为 compact summary 最高预留 20k tokens；Codex 明确把 summary 当 handoff checkpoint。LG 当前 1400 tokens 对小说创作、长设定、长期纠错来说偏少。

### P2：增加 microcompact，而不是所有东西都 full summary

优先处理最容易膨胀、又不适合语义总结的内容：

- 长工具输出；
- 文件全文读取；
- 搜索结果；
- 诊断日志；
- 大段草稿生成中间态；
- streaming progress 中间态。

建议策略：

```text
保留工具调用名、参数、摘要、关键结果、错误
删除或外置完整 stdout / file content / search dump
必要时用 artifact id 或 file path 引用原始内容
```

这能减少 full compact 的压力，也能避免把压缩模型的 token 浪费在机械性大文本上。

### P3：Context Window 改成“发送前真实预算”

小圈应显示本轮如果发送会占多少，而不是只显示 agent 历史。

估算应包括：

```text
agent session messages
+ compaction/thread memory
+ project context
+ current user input
+ selected references
+ response constraints
+ selected skills
+ workflow action
+ expected output reserve
```

并分层显示：

- normal；
- warning；
- should compact；
- auto compact；
- blocking。

这点直接借鉴 Claude Code 的 warning/error/blocking 分层。

### P4：压缩请求过长时按消息组重试

不要只做字符串 `slice(0, 120_000)`。建议改成：

1. 按 turn / API round / tool pair 分组。
2. compact 请求过长时删除最旧 group。
3. 保证 user-assistant-tool_result 结构合法。
4. 记录被丢弃范围。
5. 在 summary 中说明“更早内容已因压缩请求过长被截断”。

这是 Codex 和 Claude Code 都明确处理的问题。

### P5：压缩边界 metadata 化

当前 compaction memo 是 system message，信息太少。建议记录：

```ts
interface CompactionBoundary {
  id: string
  createdAt: string
  trigger: "manual" | "auto" | "reactive"
  tokenBefore: number
  tokenAfter: number
  compactedTurnIds: string[]
  preservedRecentTurnIds: string[]
  summaryMessageId: string
  strategy: "thread-memory" | "microcompact" | "full-summary"
}
```

这能解决后续调试问题：为什么模型忘了？哪轮被压缩了？压缩前后省了多少？是否多次压缩导致失真？

---

## 7. 最重要的产品判断

Codex 和 Claude Code 都说明一件事：**长对话不是靠一次 summary 解决的，而是靠多层上下文治理。**

当前 LG / Novel Guide 最容易踩的坑是：

> 以为加一个更大的 compaction summary 就能解决长对话，但真正的问题是 UI thread、产品记忆、agent session、工具输出、当前 turn prompt、sub-agent prompt 分属不同层级。

因此建议不要只改 `compactMessagesIfNeeded()`，而是按下面顺序推进：

```text
Thread Memory
  -> 结构化 compact prompt
  -> microcompact 工具输出
  -> 真实 turn budget 小圈
  -> 压缩边界 metadata
  -> sub-agent 自动继承 thread memory
```

---

## 8. 一句话结论

当前文档的结论应升级为：

> LG / Novel Guide 现在有 agent 级 compaction，但缺少 Codex 式 checkpoint replacement、Claude Code 式多层压缩治理和产品级 Thread Memory；下一步应先建立 thread memory，再把压缩拆成 microcompact、structured checkpoint、真实预算预估和压缩边界 metadata，避免把所有长对话连续性都押在一次 1400-token summary 上。
