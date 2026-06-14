# Skill Lab 重设计方案

> 状态：已确认设计方向（含「使用驱动闭环」修正），待实现
> 范围：`apps/lg` 工作台 → Skill Lab（`tab="lab"`）及其与 Skill 面板、写作流程的衔接

---

## 核心修正 1：skill 的来源是「有效的提示词」，不是 diff

最关键的修正——**沉淀的原料换源**。

diff 驱动有两个结构性盲区，无法靠优化绕过：
1. **只见「被修正」，对「一次就写好」失明**：好指令一次产出就满意、原样留下 → diff 是空的。而「不用改」恰恰是好 skill 最强的证据。diff 驱动系统性漏掉所有「首稿即好」的成功案例。
2. **diff 只记「改了什么」，不记「当时的指令/意图」**：skill 本质是一条可复用指令，指令活在**提示词**里，不在 diff 里；从 diff 反推意图常常推不出来。

**skill 的真正原料 = 用户在使用中「亲手写出、且验证有效」的提示词。** 一条反复要对 AI 说、说了效果就好的指令 → 固化成 skill，让用户不必反复打。

链路数据已全部持久化，可直接挖：
```
Message(role="user").content   ← 提示词（持久化）
   │ turnId
Turn → assistantMessageId → done 事件 ledgerEntryIds
   │
AI 产出的 ledger 条目(actor="agent")
   │ 同路径后续是否出现 actor="user" 改写
「好效果」信号：未被重写 = 该提示词产出被接受
```
→ 找出**反复出现 + 产出被接受**的指令 → 即该沉淀的 skill，自带可信出处「来自你这 N 次都奏效的提示词」。

信号源重新排序：

| 信号源 | 捕获什么 | 地位 |
|---|---|---|
| **有效提示词**（chat 里反复、产出被接受的指令） | 用户**明确表达**且验证有效的写法 | **主源** |
| **手动重写聚类**（`actor=user` 纯手改） | 用户**没说出口、却亲手在做**的隐性偏好 | 补充 |
| **AI 改稿 diff** | AI 自我修订模式 | 最弱，降为佐证 |

「分析最近改稿」→ 改名/改实质为「**从最近的使用里提炼**」：同读提示词 + 产出接受度 + 手改。需要一步 LLM **蒸馏**：把情境化指令（含具体人名/场景）抽象成可复用规则（如「这段战斗先写萧炎和林焰谁强」→「战斗场景：先交代双方强弱与空间位置，再写招式因果」）。

---

## 核心修正 2：验证靠「真实使用」，不靠合成 A/B

验证这一支柱**换主干**：

- `LedgerEntry` 已有 `actor: "user" | "agent"` 字段。**真正的验证信号本就在发生**：AI 挂着 skill X 写了一段（`actor=agent`），用户随后又手动改写了那段（`actor=user`）——这次修改就是对 skill X 最真实的判决。免费、连续、零仪式。
- 因此：**「真实使用履历」（重写率）作为验证主干**；合成 A/B 试跑**降级为冷启动探针**（仅给没有使用历史的全新 skill，或需要隔离单条 skill 时用）。
- 沉淀 + 验证由此**合并成同一个由真实写作驱动的闭环**，不再需要合成 harness 当主干。完全契合「real AI over fake heuristics」。
- 前提：需补一个**归因字段**——在 AI 写作产生的 ledger 条目上记下当时挂了哪些 skill（把 `selectedSkills` 透传进 `recordAgentFileChanges`）。小改动，但是整个闭环的地基；它同时服务于「修正 1」的提示词好效果判定与「修正 2」的 skill 重写率。

两者边界（互补，非二选一）：使用闭环给「面」（泛化表现），A/B 给「点」（隔离单条 skill 的因果，及冷启动）。归因在多 skill 同挂时是模糊的，A/B 是唯一能干净隔离单条的手段。

---

## 一、问题诊断：为什么现在的 Skill Lab 不满意

现在的 Lab 本质是一个**「一次性建议 feed」**，不是「实验室」。

| 期望 | 现状 | 缺口 |
|---|---|---|
| **沉淀的原料对** | 只读改稿 diff 提炼 | diff 对「首稿即好」失明、且看不见意图。skill 的真原料是**用户反复给、且有效的提示词**（见核心修正 1） |
| **长期沉淀** | 点一次「分析最近改稿」→ 出 0–5 张卡 → 处理掉就没了。`dismissed/drafted/applied` 是终态，再分析被过滤 | 没有「随时间累积、证据变强、慢慢浮现」的概念。是反应式，不是沉淀式 |
| **自行探索** | 完全没有，只能被动等 AI 读最近 20 条 diff | 用户无法主动提假设，让系统去自己稿子里求证 |
| **验证** | 完全没有，建了 skill 就扔那 | skill 好坏是黑盒，这是最大的窟窿 |

而且 Lab（产建议）和 Skill 面板（管文件）割裂——一条规律从「被观察到」到「成为可靠 skill」的**生命周期没有被建模**。点完「生成草稿」后，建议与最终 skill 就失联。

**核心问题一句话：它缺少一个生命周期。**

---

## 二、重新定位：Lab = Skill 孵化器（生命周期工作台）

把 Lab 从「建议列表」改造成一条显式的生命周期流水线：

```
  有效提示词/手改         实验草稿            真实使用            沉淀
  (Observation)  ──▶  (Experimental) ──▶ (用了N次/重写率) ──▶ (Active Skill)
   ▲  反复出现的有效指令    ▲ 可编辑·写作中可用    ▲ ledger 归因      │
   │  +手改聚类(隐性偏好)   │  (标「实验中」)      │ 重写率低则毕业     │ 反哺
   │  (diff 仅佐证)        └── 冷启动? A/B探针隔离单条 ──┘             │
   └──────────────────────────────────────────────────────────────┘
                          高重写率 → 用户的改动指出怎么改 → 迭代
```

- **Skill 面板**：长期实践沉淀下来的成果区（active + 已标记实验中的 skill）。
- **Lab**：孵化区。线索在这里累积、实验在这里跑、验证在这里发生。

这样「沉淀 / 探索 / 验证」三件事各自有归宿。

---

## 三、三大支柱

### 支柱 1 — 沉淀（持续累积的「观察」，主源 = 有效提示词）

把 `SkillSuggestion` 升级成**持久累积的 Observation**，且**换原料**（见核心修正 1）：

**主源——有效提示词挖掘**：
- 读 chat 里 `role="user"` 的提示词，按语义聚类找**反复出现**的指令；用「提示词→产出→是否被接受」链路给每个簇打**好效果**标签。
- 反复出现 + 产出被接受 → 浮为观察。直观信号：**「你已 6 次这样指挥 AI，且 5 次产出直接采用」**——这才是「沉淀」最该有的表达。
- LLM **蒸馏**：把情境化指令抽象成可复用规则（去掉具体人名/场景）。
- 反复出现本身还说明：当前没有 skill 覆盖它（否则不必反复打）→ 天然是「新建」候选。

**补充源——手动重写聚类**：`actor=user` 的纯人工改写编码了作者**没说出口、却亲手在做**的隐性偏好，比「让 AI 猜 diff」纯粹，直接喂「改进现有 skill」。

**佐证——AI 改稿 diff**：降为辅助证据，不再是主入口。

累积机制：每次「从最近使用里提炼」不覆盖、不永久过滤，而是**合并 + 增强**（复现则追加证据、提升 strength、记 `seenInAnalyses`）。用户对一条观察可：`确认` / `忽略` / `合并到已有 skill`；确认或 strength 够高 → 一键「孵化成实验 skill」，skill 正文即蒸馏出的指令，自带出处「来自这 N 条奏效的提示词」。（可选）后台静默触发，受模型通道开关约束。

> observation 是**只读洞察层**，沉淀的是「证据」不是「结论」。

### 支柱 2 — 探索（降级为 chat 里的轻量入口）

novel-guide agent 本就能读稿子、找规律、起草 skill，独立的「探索子系统」与 chat 重叠。因此**不再做成 Lab 的独立模式**，而是降级为：

- chat 里一个 prompt 模板 / 一键「在稿里找这个写法的证据」。
- 用户写假设 → 复用现有 agent 检索正文 + ledger → 给证据简报（✅ 支持 N 处 / ⚠️ 反例 M 处，可跳原文）→ 成立则一键孵化成实验 skill。

价值不变（把直觉对着真实文本验一遍再固化），但不新建子系统，省一份维护成本，也符合「极简、不堆砌」。

### 支柱 3 — 验证（主干 = 真实使用履历，A/B = 冷启动探针）

**主干：使用驱动闭环（真实、免费、零仪式）**

1. 在 AI 写作产生的 ledger 条目上记 `activeSkillIds`（见架构「归因地基」）。
2. 每条 skill 自动攒出**真实履历**：被用了 N 次；其中多少次 AI 产出**被用户随后手动重写**。
   - 重写率低 → skill 在落地，可沉淀为 active。
   - 重写率高 → 没生效，且**用户的修改本身指出该怎么改**：「skill 说 X，你 7 次产出里 5 次把 X 改成 Y」→ 精确的 improve 建议，远胜「AI 重读 diff 猜」。
3. 沉淀 + 验证由此合并成一个由真实写作驱动的闭环。

**探针：合成 A/B 试跑（仅冷启动 / 需隔离单条 skill 时）**

全新 skill 没有使用历史，或多 skill 同挂导致归因模糊、想干净隔离单条时，按需跑一次：
1. 选样本段落。**默认**从该 skill 证据所在的 ledger 场景自动挑一段，旁边给「换一段 / 从编辑器选 / 粘贴」。
2. 后台用 `callChatCompletion`（**沙箱、纯文本、不写任何文件**）跑两遍同一改写任务：A 不带 skill、B 带 skill（SKILL.md 注入 system）。
3. 并排展示 A / B + 高亮 diff。可选让 AI「评审」用一句话说明 B 相对 A 的变化、是否命中意图。
4. **人来判**：👍 有效 / 😐 没差别 / 👎 没用，记进 `trials` 履历。

> 严格遵守「real AI over fake heuristics」：**不造任何假打分指标**。主干用真实取舍行为，探针用真实生成 + 人判断。AI 评审只「解释差异」，不冒充裁判。

「改进现有 skill」同样：优先看真实重写履历；需要时用 A/B（旧版本 vs 新版本，同段落跑）做隔离对比。

---

## 四、已确认的关键决定

1. **全做，按 1→2→3 顺序**：沉淀 → 验证 → 探索，每个 Phase 做完可单独验收。
2. **A/B 样本两者都支持、自动挑为默认**：默认从证据所在 ledger 场景自动挑段，支持手动换段 / 编辑器选段 / 粘贴。（A/B 已降级为冷启动探针，非验证主干。）
3. **实验 skill 允许在写作里选用，但显式标「实验中」**：`stage` 不做硬隔离，而是显式标记——`resolveSkillSummaries` 照常能注入实验 skill，但 chat 的 skill 选择器与 Skill 卡片给「实验中」角标。

---

## 五、数据模型与架构

复用现有 `skill-lab.json` sidecar，扩展之；**SKILL.md 保持干净**。

```ts
// 观察层（持久累积，替代一次性 SkillSuggestion）
interface Observation {
  id; kind: "new" | "improve"; title
  observation                 // 蒸馏出的可复用规则
  strength: number            // 随复现增长，取代一次性 confidence
  evidence: Evidence[]        // 跨多次分析累积、去重
  seenInAnalyses: number      // 出现过几轮分析 → 沉淀感
  origin: "effective_prompt" | "manual_rewrite" | "ai_diff"
  status: "surfacing" | "confirmed" | "incubated" | "dismissed"
  incubatedSkillName?: string // 孵化后指向哪个实验 skill，建立联系
  // kind==="new": proposedName / proposedRules
  // kind==="improve": targetSkillName / proposedChange
}

// 证据：提示词类证据带「好效果」标签
interface Evidence {
  kind: "prompt" | "manual_rewrite" | "ai_diff"
  ref: string                 // prompt→messageId/turnId；其余→ledgerEntryId
  targetPath?: string
  excerpt: string             // 提示词原文 / 改写片段
  accepted?: boolean          // kind="prompt": 产出是否未被随后重写
}

// skill 履历（sidecar，不污染 SKILL.md）
interface SkillLabMeta {
  name: string
  stage: "experimental" | "active"   // 仅作标记，不硬隔离
  originObservationId?: string
  usage: SkillUsageStats            // 主干：真实使用履历
  trials: Trial[]                   // 探针：按需 A/B
}

// 真实使用履历（由 ledger 归因聚合而来）
interface SkillUsageStats {
  timesUsed: number                 // 挂着此 skill 的 AI 写作次数
  timesRewritten: number            // 其中产出随后被用户手动重写的次数
  rewriteRate: number               // = timesRewritten / timesUsed
  recentRewrites: Evidence[]        // 最近几次重写（喂 improve 建议）
}

interface Trial {
  id; sampleSource: "ledger" | "editor" | "paste"; sampleText
  outputWithout; outputWith
  verdict: "helped" | "no_diff" | "hurt" | null
  judgeNote?: string; createdAt
}
```

**归因地基（沉淀主源 + 验证主干共同的前提，最先做）**
- `lib/types.ts` / `ledger.ts`：`LedgerEntry` 增加可选 `activeSkillIds?: string[]`（仅 `actor=agent` 的写作条目带）。
- `chat-service.ts`：把 `selectedSkills` 的 id 透传进 `recordAgentFileChanges` → `appendLedgerEntry`，写入 `activeSkillIds`。
- 新增「提示词→产出→接受」聚合：用 `Turn`(userMessageId→assistantMessageId) + done 事件的 `ledgerEntryIds`，把每条用户提示词关联到它产出的 ledger 条目；再看同路径后续是否出现 `actor=user` 改写 → 给提示词打 `accepted`，给 skill 算 `SkillUsageStats`。
- 这一份归因同时服务两件事：**判定提示词是否「有效」（沉淀主源）** 与 **算 skill 重写率（验证主干）**。

**Service 层**
- 改造 `skill-lab-service.ts`：分析入口从「读 diff」改为「**读使用**」——拉 chat 提示词 + 接受度标签 + 手改聚类（diff 仅佐证），交 LLM 一次完成「聚类 + 蒸馏可复用规则 + 关联证据」；`mergeSuggestions` → 真累积合并（strength 增长、证据去重追加、不丢历史）；新增 `incubateObservation`（observation→实验 skill，正文用蒸馏规则）。
- `skill-service.ts`：`listSkills` 带出 `stage` 与 `usage`；读/写 sidecar meta；提供 `promote`（experimental→active）。
- 新增 `skill-trial-service.ts`：**冷启动探针**——A/B 沙箱试跑（两次 `callChatCompletion`，纯文本返回，**绝不写文件**）+ 记录 verdict。
- 探索：复用现有 novel-guide agent（chat 入口 / prompt 模板），**不新建独立 service**。
- `chat-service.ts` / `resolveSkillSummaries`：实验 skill 照常可注入，返回结构带 `stage` 供前端标记。

**API（沿用 `skills/lab/` 目录）**
- `POST lab/analyze` — 从最近使用提炼（替代原「分析改稿」语义）
- `POST lab/[id]/incubate` — 观察 → 实验 skill
- `POST lab/[skill]/promote` — 毕业为 active
- `POST lab/trial` & `POST lab/trial/[id]/verdict` — 冷启动 A/B 探针与判定
- 探索：不新增 Lab 端点，走 chat。

---

## 六、UI（保持克制，符合「极简、不堆砌」口味）

Lab 顶部一行三个轻量分段（不是塞满的 dashboard）：

```
 Skill Lab        [ 沉淀 ]  [ 实验台 ]                  从最近使用提炼 ↻
 ─────────────────────────────────────────────────────────
 沉淀:   累积观察，按 strength 排序，粗的浮在上面
         每条:  规律标题 · 「你已 6 次这样指挥 AI · 5 次产出直接采用」
                展开看证据 = 你写过的提示词原文 · [孵化] [忽略]
 实验台: 实验中的 skill 卡片，每张显示真实履历:
         「用了 12 次 · 9 次几乎没改 · 重写率 25%」→ 表现好则 [毕业]
         冷启动/想隔离时:  [A/B 试跑] 入口 + 探针记录(👍2 😐0 👎0)
 探索:   不占独立 tab —— chat 里一键「在稿里找这个写法的证据」
```

- 沉淀卡片的证据是**用户真写过的提示词**（可点开跳到那条对话），出处可信、可追溯。
- 履历卡片是实验台主视图；A/B 是次级按钮，不抢戏。
- A/B 结果用现有并排 + diff 高亮风格，与 ledger diff 视觉一致。
- Skill 卡片 / chat skill 选择器：`experimental` 加「实验中」角标。

---

## 七、分期落地

### Phase 1 — 沉淀（主源=有效提示词）+ 归因地基（最小、最快见效，且解锁后续）

| 文件 | 改动 |
|---|---|
| `lib/types.ts` | `SkillSuggestion` → `Observation`（`origin: effective_prompt\|manual_rewrite\|ai_diff`，加 `strength` `seenInAnalyses` `incubatedSkillName`，扩展 `status`，`Evidence` 带 `kind/accepted`）；新增 `SkillLabMeta.stage`；`LedgerEntry` 加 `activeSkillIds?` |
| `lib/server/ledger.ts` | `appendLedgerEntry` 接受并写入 `activeSkillIds` |
| `lib/server/chat-service.ts` | `recordAgentFileChanges` 透传 `selectedSkills` 的 id 到 ledger |
| `lib/server/skill-lab-service.ts` | 分析入口改「读使用」：拉提示词 + 接受度 + 手改 → LLM 聚类/蒸馏；`mergeSuggestions` 真累积合并；新增 `incubate` |
| `lib/server/skill-service.ts` | `listSkills` 带 `stage`；读写 sidecar meta |
| `app/api/.../skills/lab/route.ts` + `.../[id]/incubate/route.ts` | `analyze` 改实质为读使用；新增孵化端点 |
| `lib/api/skills.ts` | 加 `incubateObservation` 客户端 |
| `components/lg/workbench/skill-lab.tsx` | 沉淀视图（按 strength 排序、「你已 N 次这样指挥」、提示词证据、孵化/忽略） |
| `skill-card.tsx` / chat skill 选择器 | 「实验中」角标 |

> 归因字段本 Phase 落地但**不阻塞 UI**——它先开始累积数据，Phase 2 才消费 skill 重写率。提示词接受度判定本 Phase 即用上。

### Phase 2 — 验证（主干 = 真实使用履历，A/B = 探针）

- `skill-service.ts`：新增 ledger 归因聚合 → `SkillUsageStats`（重写率）；`promote`。
- improve 建议接入「高重写率 skill + 手动重写聚类」。
- 新增 `skill-trial-service.ts`（冷启动 A/B 沙箱 completion）+ trial / verdict / promote API。
- 实验台 UI：履历卡片为主（用了 N 次 / 重写率），A/B 为次级按钮；毕业按钮。

### Phase 3 — 探索（最轻，走 chat）

- chat 里一键「在稿里找这个写法的证据」/ prompt 模板，复用 novel-guide agent。
- 证据简报里给「一键孵化成实验 skill」。
- **不新建 Lab 子系统 / 独立 service / 独立 tab。**

---

## 八、贯穿原则

- **skill 来自有效提示词**：沉淀主源是用户反复给、且产出被接受的指令，不是 diff。diff 对「首稿即好」失明、也看不见意图。
- **真实 AI，不造假指标**：沉淀靠真实提示词+接受度，验证靠真实重写率，A/B 靠真实生成+人判断；AI 只做聚类/蒸馏/解释，不冒充裁判。
- **沙箱安全**：A/B 试跑只读 + 纯文本返回，绝不写项目文件。
- **SKILL.md 干净**：实验/active 状态、履历、出处全部进 sidecar。
- **可追溯出处**：每条 skill 能回指「来自你这 N 条奏效的提示词 / N 次手改」。
- **极简 UI**：两段切换（沉淀/实验台）+ 探索走 chat，不堆 dashboard，视觉与 ledger/编辑器一致。
