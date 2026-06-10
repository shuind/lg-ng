# LG-NG 优化分析

> 两个视角：先以「产品 / Agent / 小说家」三重身份建模产品该往哪走，再以「架构师」身份分析工程该怎么改。
> 基于对当前代码库的实际通读，不是空谈。

---

## 定调（最重要的前提）

作者本人的判断，作为本文档的总纲：

> **LG 那套 agent loop 是初学时的设计，效果差、思路陈旧，应当退役。
> 抄 Claude Code 的通用 agent（`packages/novel-guide`）效果好，是产品的真正内核，应当保留并在其上建设。**

所以这不是「甲/乙二选一」的骑墙题，而是一道**减法题 + 在好内核上做小说特化**的题：

1. **退役 LG 旧脑**：`taskModel`/`ActionPlan`/`llm.ts` 的 19 种 action schema / `outline-guards` / `system-check-service` / `agent-memory` —— 凡是「另起一套智能」的，删。
2. **保留并夯实通用脑**：`novel-guide` 的工具循环就是主路径，已经在跑，效果好。
3. **小说能力用「通用脑的原生机制」表达**：检查器 = subagent，创作规则 = skill，正典护栏 = 工具 permission，长篇记忆 = 通用 compaction。**不要再为小说单独发明一套并行系统**——那正是旧设计踩过的坑。

下文凡涉及「路线甲/路线乙」的旧表述，一律以本节为准：**走减法 + 原生机制特化。**

---

## 第一部分：产品 / Agent / 小说家视角

### 0. 当前产品到底是什么（建模）

把现在的系统抽象成一句话：

> **一个跑在小说文件目录上的通用 Claude-Code 式 Agent，外面套了一层 Next.js 写作工作台 UI。**

实体关系：

```
作者(User)
   │  发消息 / 选设定卡 / 选技能 / 选回复约束
   ▼
LG UI (chat-panel / workbench / sidebars)
   │  HTTP（一次性、无流式）
   ▼
chat-service ──► novel-guide AgentEngine（每线程一个会话）
   │                    │ query loop（最多 8 轮工具调用）
   │                    ▼
   │            真实文件工具：read/write/edit/grep/glob/shell/git/subagent/skill
   ▼
书目录 = 唯一数据库（.md / .json / .jsonl，无 DB）
   └─ ledger.jsonl（写入留痕）+ dirty-index（待索引）+ book-index（检索）
```

这个模型本身是对的——**文件即真相、Agent 直接操刀、ledger 留痕**，对小说创作是非常合适的范式。问题不在范式，在于**产品意图和实现严重脱节**。

---

### 1. 核心问题：旧脑残骸还躺在代码里，制造「假能力」错觉

代码里同时存在两套智能实现，但它们的地位不对等——一套是该退役的旧脑，一套是已经在跑的好内核：

| | 旧脑（LG legacy，**应退役**） | 通用脑（抄 Claude Code，**保留**） |
|---|---|---|
| 位置 | `llm.ts` 的 19 种 `LlmActionSchema` + `outline-guards.ts` + `system-check-service.ts` + `agent-memory.ts` + `plan/LG_runtime_agent_eval_cases.md` | `novel-guide/AgentEngine` + `query.ts` + 工具层 |
| 设计思路 | 预定义意图分类 + 固定 action 枚举 + 规则式守卫（初学设计：把模型当分类器，所有能力硬编码成 schema） | 通用工具循环：模型自己决定读/搜/改/调 subagent，无固定意图枚举 |
| 现状 | **基本是死代码**：经 grep 确认 `system-check-service`/`agent-memory`/`outline-guards` 零调用方；`LlmActionSchema`/`LlmAction` 零消费方 | **唯一被 `chat-service` 调用的主路径**，效果好 |

**为什么旧脑思路陈旧（值得记下来，避免重蹈覆辙）：**
- 它把「智能」拆成 19 个写死的 action 类型（`gender_change`、`outline_update`、`foreshadowing_add`…）。每新增一种创作操作就要改 schema、改分发、改守卫——**这正是把通用模型退化成关键词分类器**，扩展性差、覆盖不全、误判多。
- `outline-guards.ts`（236 行）用一堆正则去猜「用户这句是不是想保存大纲」，本质是在补救「action 分类不准」。通用脑里这个问题根本不存在——模型直接判断要不要调 `write_file`。
- eval cases 写得好，但它们是**为旧脑的内部状态（`taskModel`/`proposalNodes`/`selfImprovement`）写的断言**。旧脑退役后，这些断言失去对象。其中真正有价值的「意图/行为期望」应当**改写成针对通用脑的行为测试**（见架构 §3），文档本身可归档。

**结论**：不去「接通」旧脑，而是**移除**它。残骸留着的唯一作用是让代码库显得比实际能力强，误导维护者（比如 UI 里 `brief.selfImprovement.*` 字段永远为空）。

> ⚠️ 删除前注意一条**活的依赖边**：`llm.ts` 里的 `getConfig` / `callChatCompletion` 这两个 **helper 仍被 `draft-service.ts`（AI 试写）和 `skill-service.ts`（技能摘要）使用**，是活代码。死的是 `LlmActionSchema` / `LlmAction` / `system_check` 那部分**意图枚举**。删除时要**切割**：保留 LLM 调用 helper（最好顺手并进通用脑的 LLM 客户端，见架构 §1.2），删除 action schema 与依赖它的 `system-check-service`。

---

### 2. 通用脑虽好，但要为「小说长篇创作」补三块能力——用原生机制，别再造旧脑

通用脑（Claude Code 范式）在通用编码任务上验证过，但小说创作有它特有的需求。关键原则：**这几块都用通用 agent 已有的原生机制实现，而不是像旧脑那样另起一套并行系统。**

> 注：权限**不在**补强清单里——`bypass`/full 权限是对的，见下。真正要补的是检索、创作体检、长篇记忆。

#### 2.1 权限就是 full 权限——`bypass` 是对的，别加确认回合
- 现状：`runNovelGuideAgent` 传 `permissionMode: "bypass"`（`novel-guide-agent.ts:122`），`canonGate` 形同虚设。
- **这是对的，不要改。** 实际编程 agent（Claude Code、Cursor）的真实体验就是 full 权限直接动手——没有人会为每次 `write_file` 一条条点「允许」，那会摧毁心流。旧脑那套「先 schema 判断是不是 canon 操作、再弹确认」正是初学时的过度设计，应随旧脑一起退役。
- **安全靠「可逆」兜底，不靠「事前确认」**：
  - `ledger.jsonl` 已记录每次写入的 before/after 快照，且有 rollback API（`ledger/[entryId]/rollback`）。这才是创作场景正确的安全模型——**让 AI 放手改，改错了一键回退**。
  - 真正要补的不是确认弹窗，而是把**回退做得顺手**：UI 里每条 AI 变更旁边一个「撤销」按钮，而不是事前拦截。
  - 可选的轻量护栏：仅对**不可逆/高破坏**操作（如 `shell` 里的 `rm -rf`、`git reset --hard`）保留确认，普通文件读写一律放行。这与 Claude Code 的做法一致：危险 shell 命令才提示，编辑文件不提示。
- **结论**：删掉 `canonGate` 和 two-phase 提案的想法。把工程量投到「ledger 回退体验」上。

#### 2.2 创作体检：用「subagent」，不是用 `system-check-service`
- `system-check-service.ts`（伏笔/时间线/角色位置/读者体验/质量五种检查）是旧脑产物、零调用方。
- 但它要解决的需求（长篇一致性体检）是真实且高价值的。**原生解法**：模板里已经有 `continuity-checker`、`canon-conflict` 两个 **review subagent**（`templates.ts`），这才是对的形态。把「体检」做成：UI 按钮 → 触发一次 `run_agent` 调用 → 返回结构化报告。删掉 `system-check-service`，把它的五个检查维度**改写进 subagent 的 prompt**。

#### 2.3 创作规则：用「skill」，不是硬编码
- 风格、禁止项、类型规则这些，已经有 `skill-service` + `.claude/skills/` 的机制承载（`intake`/`archive`/`novel-review`）。继续走 skill，不要回到旧脑把规则写进 action schema 的老路。

#### 2.4 长篇上下文：用「通用 compaction」，不是 `agent-memory.ts`
- 现状：`session.ts` 全量存盘 + 全量回灌（`engine.ts:50`），`query.ts` 无任何压缩。长篇几百章、上百轮，**几十轮后必爆 context window**，且每轮全量重发，token 成本线性爆炸。
- `agent-memory.ts` 的 `conversation-summaries` 是旧脑设计，零调用。
- **原生解法**：Claude Code 范式本身就有 compaction 思路——到阈值把旧轮摘要成备忘。在内核 `AgentEngine` 里实现一次通用 compaction，所有项目（含小说）共享，而不是为小说单建一个 memory 子系统。


---

### 3. 小说家视角：这个工具好不好用？

把自己当成正在写《长生》的网文作者，逐项体验：

| 我想做的事 | 现在能不能做 | 痛点 |
|---|---|---|
| 跟 AI 讨论剧情走向，不希望它乱动文件 | 能讨论，但**没有护栏**，模型可能顺手改文件 | 缺「只读讨论模式」 |
| 让 AI 帮我查「顾慎现在在哪、欺天大阵的设定」 | 能，但检索是**关键词匹配**（`retrieval.ts`），别名/同义词查不到 | 检索弱，长篇里查不准 |
| 写到第 50 章，想让 AI 检查伏笔有没有埋了没收 | 设计了（`伏笔清单.md`、system-check）但**没入口** | 最值钱的能力被藏起来 |
| 让 AI 续写一段，但只是试写不入正文 | `draft-service` 有试写沙盒 | 这个做得不错 ✓ |
| AI 改错了，我想回退 | `ledger` 有 rollback API | 这个方向对 ✓ |
| 看 AI 这一轮到底干了啥 | UI 显示的是**预制文案**（"已开始处理"、"处理完成"），不是真实思考流 | 黑盒感强，无流式 |

**小说家最需要、当前最缺的三件事：**
1. **可信的边界**：讨论 vs 落盘必须泾渭分明，且由系统保证，不靠模型自觉。
2. **长篇记忆**：跨章、跨对话的设定一致性，需要真正的检索 + 摘要压缩，而不是关键词 grep + 全量回灌。
3. **创作体检**：一键跑伏笔/时间线/连续性检查，给出结构化报告。

---

### 4. 产品优化建议（按优先级）

1. **P0 — 退役旧脑（减法）**：删除 `LlmActionSchema`/`LlmAction`/`system_check` 枚举、`outline-guards.ts`、`system-check-service.ts`、`agent-memory.ts`；归档 `LG_runtime_agent_eval_cases.md`。**切割保留** `llm.ts` 里被 `draft-service`/`skill-service` 使用的 `getConfig`/`callChatCompletion`。让产品诚实——UI 里永远为空的 `brief.selfImprovement.*` 字段一并清掉。
2. **P0 — 安全靠「可逆」而非「确认」**：保持 `bypass` full 权限不变；不加确认回合。把工程量投到 ledger 回退体验：UI 每条 AI 变更旁加「撤销」按钮，复用已有的 `ledger/[entryId]/rollback`。仅对不可逆 shell 命令（`rm -rf`/`git reset --hard`）保留提示。删掉 `canonGate`。
3. **P1 — 创作体检 = subagent**：删 `system-check-service`，把五个检查维度写进 `continuity-checker`/`canon-conflict` subagent 的 prompt，UI 加「体检」按钮触发 `run_agent`。
4. **P1 — 流式响应**：模型→UI 走 SSE，展示真实工具调用流，去掉预制文案。
5. **P2 — 检索升级**：别名表（`aliases`）+ 章节级倒排索引。
6. **P2 — 上下文压缩**：在通用脑内核做一次 compaction，所有项目共享。

---

## 第二部分：架构师视角

### 1. 现状评估：好内核 + 旧脑残骸 + 几处断线

**好的地方（保留并夯实）：**
- monorepo 分层清晰：`packages/novel-guide`（可独立 CLI 的通用 agent 内核，抄 Claude Code）/ `apps/lg`（产品 UI + 服务层）。内核刻意保持通用、注释标了对 Claude-Code 源码的参照——**这就是该长期投资的主干**。
- 文件即真相 + ledger 留痕 + dirty-index 增量索引，适合创作场景的轻量架构，无需上数据库。
- 工具层抽象（`tool.ts` 的 `requiresPermission/execute/PermissionDecision`）设计正确，扩展性好。

**要清理的地方：**

#### 1.1 旧脑残骸（应删除，非「将来接线」）
经 grep 确认，以下是**初学时设计的旧脑、且零调用方**，应物理删除：
- `apps/lg/lib/server/system-check-service.ts`（390 行）— 能力改写进 review subagent。
- `apps/lg/lib/server/agent-memory.ts`（184 行）— 被通用 compaction 取代。
- `apps/lg/lib/server/outline-guards.ts`（236 行）— 正则猜意图，通用脑不需要。
- `apps/lg/lib/server/llm.ts` 的 `LlmActionSchema`/`LlmAction`（约 120 行）— 19 种硬编码 action 枚举，零消费方。
- `apps/lg/plan/LG_runtime_agent_eval_cases.md` — 为旧脑内部状态写的断言，归档；有价值的行为期望改写为通用脑的行为测试。

> 合计约 900+ 行旧脑代码。删除依据：作者已确认旧脑思路陈旧、效果差，应退役；通用脑才是主路径。残骸唯一作用是制造「假能力」错觉。

> ⚠️ **切割保留**：`llm.ts` 的 `getConfig` / `callChatCompletion` 是**活代码**（`draft-service`/`skill-service` 在用）。删 schema、留 helper，最好把 helper 并入 §1.2 的统一 LLM 客户端。

#### 1.2 两条 LLM 调用栈并存（应收敛）
- 栈一：`novel-guide/model/deepseek.ts`（`createChatCompletion`，OpenAI SDK，给 agent loop 用）。
- 栈二：`apps/lg/lib/server/llm.ts`（`callChatCompletion`，裸 fetch，给 `draft-service`/`skill-service` 用）。
- 两套 provider 配置、超时、错误处理，重复且会漂移。**收敛为一个 LLM 客户端**（建议放 `novel-guide`，app 层只配置 provider 并复用）。

#### 1.3 UI 组件碎片
- `components/lg/chat-panel.tsx`（119 字节 re-export）与 `chat-panel/index.tsx` 并存。`git status` 显示 chat-panel/right-sidebar/workbench 一批文件正在拆分重构（untracked）——**正好借这次重构期一并收口 dead code 与碎片**。

---

### 2. 关键架构缺陷与改造方案

#### 2.1 缺流式（Streaming）
- 现状：`createChatCompletion` 写死 `stream: false`（`deepseek.ts:82`），`chat-service` 同步等整个 agent loop 跑完再返回，UI 事件是事后补的预制文案。
- 影响：长任务下用户盯着 loading 转圈几十秒；无法中断；无法看真实进度。
- 方案：
  - `query.ts` 改为 async generator，逐 token / 逐工具调用 yield 事件。
  - `chat-service` 走 Next.js Route Handler 的 `ReadableStream` + SSE。
  - 引入 `AbortSignal` 贯穿 engine→query→model，支持取消。

#### 2.2 上下文无界增长
- 现状：`session.messages` 全量持久化 + 全量回灌，`query` 无压缩。
- 方案：在内核 `AgentEngine.submitMessage` 前加**通用 compaction 阶段**（所有项目共享，非小说专用）：
  - 设 token 预算（按模型上下文窗口）。
  - 超阈值时把最旧的 N 轮用一次便宜模型摘要成一条 system 备忘，写回 session。
  - 保留最近 K 轮原文 + 摘要 + 当前检索结果。
  - 注意：这是替代旧脑 `agent-memory.ts` 的方案，**不要复用那个文件**——它是旧脑的并行系统。

#### 2.3 权限：保持 full 权限，安全模型换成「可逆」
- 现状：`novel-guide-agent.ts` 传 `bypass`，`canonGate` 失效。**保持现状**——full 权限是实际编程 agent 的正确体验，确认弹窗会摧毁心流。
- 方案：
  - 删除 `files.ts` 的 `canonGate` 与内核里为「确认回合」准备的分支（`askConfirmation` 通道可保留给极少数不可逆 shell 命令）。
  - 安全兜底全部押在 ledger：`ledger.jsonl` 已存 before/after 快照 + `rollback` API 已就绪，**缺的只是 UI 把回退做顺手**（每条变更一个撤销按钮 / 批量回退到某 checkpoint）。
  - 不做 two-phase、不写 `pending-action-plan.json` 做提案。那是旧脑遗留思路，连同 `pending-action-plan.json` 一起评估是否清理。

#### 2.4 检索（Retrieval）能力薄弱
- 现状：`retrieval.ts` 是关键词 + 文件名 + dirty + 时间衰减打分。对长篇的问题：
  - 查不到别名（模板里明明强调「优先读 aliases」，但检索没用上）。
  - 中文 2-4 字滑窗当关键词，噪声大。
  - 没有章节内的段落级定位。
- 方案（渐进）：
  - 短期：把 setting card / canon 实体的 `aliases` 纳入关键词扩展。
  - 中期：构建轻量倒排索引（已有 `book-index.ts` 基础设施，扩展为 term→file/section）。
  - 长期：可选 embedding 向量检索，但对纯本地、无 DB 的定位要权衡；可先用本地 BM25。

#### 2.5 并发与一致性
- 文件即 DB，但没看到写锁。两个请求同时改同一文件 / 同时 append `ledger.jsonl`，存在竞态。
- 方案：对每本书加进程内串行队列（按 bookId 互斥），或对 jsonl append 用追加写 + 单写者保证。当前是单机本地工具，进程内 mutex 足够。

---

### 3. 测试与可验证性

- 现状：`novel-guide` 有 3 个测试（init/query/tools），针对通用脑——这是对的方向。
- 旧脑的 15 个 eval case 是为 `taskModel`/`proposalNodes`/`selfImprovement` 等**旧脑内部状态**写的断言，旧脑退役后失去对象，**归档即可**。
- 但其中描述的**行为期望**有价值（如「讨论时不落盘」「review 走连续性而非代码审查」「显式保存才写文件」），应**改写成针对通用脑的行为测试**：给定输入 → 断言「是否调用了 write_file / 调用了哪个 subagent / 回复是否落盘」，而不是断言内部状态字段。
- 方案：在 `novel-guide/tests/` 或 `apps/lg/tests/` 建行为测试，mock LLM 或录制回放，纳入 `pnpm check`。

---

### 4. 架构改造路线图（建议顺序）

| 阶段 | 动作 | 价值 | 风险 |
|---|---|---|---|
| **S0 减法** | 删旧脑（action schema / outline-guards / system-check-service / agent-memory）+ 删 `canonGate`，切割保留 LLM helper，合并两条 LLM 栈，清 UI 碎片，归档 eval 文档 | 让代码库诚实，主干清晰 | 低 |
| **S1 可逆** | ledger 回退体验：每条 AI 变更加「撤销」按钮，复用 rollback API；保持 full 权限不变 | 安全靠可逆兜底，不打断心流 | 低 |
| **S2 体验** | 流式 SSE + AbortSignal + 真实事件流 | 长任务可观测、可中断 | 中 |
| **S3 长篇** | 通用脑内做 compaction + 检索升级（aliases/倒排） | 支撑真实长篇创作 | 中 |
| **S4 特化** | 创作体检做成 subagent + UI 入口；创作规则走 skill；补行为测试 | 用原生机制兑现小说差异化能力 | 中 |
| **S5 并发** | bookId 级写串行 | 数据一致性 | 低 |

> 与旧文档不同：
> - **没有**「渐进实现 taskModel/ActionPlan」阶段——旧脑思路，已退役。
> - **没有**确认/提案回合——权限就是 full 权限。S1 从「事前确认」改成「事后可逆」。

---

### 5. 一句话总结

> **范式对、内核对（抄 Claude Code 的通用 agent + 文件即真相 + 留痕）。问题是旧脑残骸还躺在代码里制造假能力错觉，而真正在跑的好内核缺四块小说所需能力——但这四块都该用通用脑的原生机制（permission / subagent / skill / compaction）实现，绝不重建旧脑那套硬编码 action 系统。**
> 先做减法（S0 删旧脑、让代码诚实），再补安全（S1）、补体验（S2/S3），最后用原生机制做小说特化（S4）。
