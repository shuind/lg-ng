# 把提示词喂给官网大模型：Handoff / Eject 设计

> 状态：设计草案 v3
> v2 修订：抽取优先 / 上下文模型锁定 / 砍校验式回流
> v3 细化：供给侧之外保留一个轻量**状态记账**——readonly 子代理从新章抽 delta、只回 delta、作者确认后才写 canon
> 适用：`packages/novel-guide`
> 关联代码：`src/agent/engine.ts`、`src/agent/query.ts`、`src/prompts/systemPrompt.ts`、`src/novel/templates.ts`、`src/cli.ts`

## 1. 背景与定位

Novel Guide 的定位是「**便捷用户**，而不是抢着自己写」。本地引擎跑在 DeepSeek / mimo（`deepseek-v4-flash` 等），擅长**检索与排版**；官网大模型（ChatGPT / Gemini / DeepSeek 网页版 / 长上下文模型等）在**纯正文文笔**上往往更强，且用户多半已为其付费。

高频诉求：

> **把"现在该写什么"打包成一段干净提示词，丢给官网模型写正文。**

本功能**核心是供给侧**：产出一段高质量、自包含、写手视角的提示词。**成稿由作者自己掌控**（贴进稿件、修改）。系统**不做校验式回流**；但为了让"下一章的提示词"持续准确，配一个轻量的**状态记账**步骤（readonly 子代理抽变化、作者确认才写 canon，见 §8）——这不是替作者管内容，而是替作者记账。

```
   ┌──────────────────────────── 供给 ────────────────────────────┐
canon/ + 上一章章尾 + 本章大纲 ──[/handoff|/eject]──▶ 干净提示词 ──▶〔官网写正文〕──▶ 作者存稿
   ▲                                                                               │
   └─ 写 canon ◀ 作者确认 ◀ delta ◀ readonly 子代理读新章（正文不回主上下文） ◀────────┘
              └─────────────────────── 状态记账（§8）───────────────────────┘
```

## 2. 设计原则

1. **抽取优先，最小生成。** 复制粘贴 > 抽取摘录 > 生成式总结。提示词应**几乎全是逐字内容**（canon 原文、上一章章尾原文、作者写的本章意图、满意的旧正文样本）。agent 只做**挑选 + 排版 + 翻译黑话**，**不重写内容**——避免 AI 味与语义走样。呼应代码既有态度：`buildProjectMemoryCard` 明写「来自文件，不是 LLM 摘要」。
2. **供给为主；回流只保留"记账"，不做"校验"。** 作者掌控成稿，砍掉 intake/checker/provenance/自愈那套**校验**管线；但保留一个轻量**状态记账**：readonly 子代理从新章抽变化 delta、作者确认后写 canon（见 §8）。否则 canon 漂、供给侧烂。
3. **锁定上下文模型（见 §3）。** 先把"写一章到底需要哪些上下文"定死；定死后，"省不省 token"基本不再是关键变量。

## 3. 锁定的上下文模型（先回答"上下文没弄透"）

写**任意一章**的提示词，agent 需要的**不是前面所有章的正文**，而是**有界且大致恒定**的状态：

| 需要 | 来源 | 量级 |
|------|------|------|
| 世界规则 / 专名 | `canon/settings` + `glossary`（仅相关项）| 小，按需召回 |
| 出场人物声音 | `canon/characters`（仅本章出场者）| 小，随活跃人物数，不随章数 |
| 未兑现伏笔 / 红线 | `NOVEL.md` open 伏笔 + `canon/foreshadowing` | 小 |
| 接住上一章 | **上一章章尾**（文件，逐字截取末段）| 固定 |
| 本章要写什么 | 本章大纲 / 作者一句话 | 小 |

**关键性质：正文永远在文件里，不进 agent 工作上下文。** 小说变长 = `drafts/` 多一个文件 + canon 推进一个小 delta；**agent 每章的上下文成本大致打平，不随小说长度增长**。这正是 `canon/` 作为唯一事实源的意义。

代码已部分如此：每轮 `NG_PROJECT_CONTEXT` 是**从文件重建的索引**（canon 只取标题/别名/路径，正文不进），`drafts/` 不在注入列表。正文只有被 `read_file` 显式读取才进上下文。
> 注意一个既有的小增长点：`summarizeLegacyLgMaterials` 会把 `章节正文/**/*.md` 各取 ~140 字摘录注入（上限 80 文件）。这是**摘录非全文、且有上限**，但仍建议复核——它与"正文不进上下文"的原则方向一致即可。

## 4. Token 账（诚实版，已收回上一版的夸大）

上一版把两件事混了，拆开：

| 项 | 挪到官网能否省 | 判定 |
|----|--------------|------|
| **生成正文的 completion token** | 能省 | **真**（但 DeepSeek 单价低，绝对额有限）|
| **"正文堆在上下文里被反复重发"的 input token** | 我上一版说是大头 | **基本是假的** |

为什么是假：按 §3 的上下文模型，写下一章只需要**上一章章尾 + canon delta**，是**有界小增量**，不是整章正文回灌。而"不让正文堆在上下文"这件事，**靠好的上下文设计就能拿到，跟正文是本地写还是官网写无关**——本地写也应当"写进 `drafts/` 文件、不在对话里反复读全文"。

**诚实结论：**

> 投喂官网真正稳健的收益 = ① **官网文笔更好**（最初动机）；② **本地上下文干净**，agent 只管状态与提词、不碰正文。**token/钱是次要、近可忽略**（DeepSeek 便宜 + 有 `promptCacheHitTokens` 缓存）。
> **不要把卖点定在"省 token"上**；定在"质量 + 职责分离"上。

附：若仍想给用户一个反馈数字，用 `estimateMessagesTokens` 给**估算**即可，并明确标注"估算、非账单、主要体现为不在本地生成正文"。

## 5. 引擎到底发了什么给 DeepSeek（为什么"裸 prompt"是错的内容）

`AgentEngine.submitMessage` 每轮组装的 `turnMessages`（`engine.ts:189-196`）：

```
[system]  主系统提示  = DEFAULT_SYSTEM_PROMPT + NOVEL_PROFILE_PROMPT (+ append)
[system]  NG_PROJECT_CONTEXT: 工作区路径 / 记忆卡 / canon 索引(带路径) / 技能表 / 子代理表
…history  user / assistant / tool 消息（含 NG_COMPACTION_MEMO、NG_CHANGE_MEMO 系统备忘）
[user]    "用户请求：\n{prompt}"
```

外加：**全套工具 schema**（`query.ts:106` `toModelTool`）。直接把它贴官网是错的，不是因为脏，而是**内容就不对**：

1. **主系统提示是给"带工具的工作区 agent"的**，不是给写手的。
2. **`NG_PROJECT_CONTEXT` 是指针不是内容**（`engine.ts:103-104`：「只是导航索引…先用 `read_file` 读取对应路径」）。官网模型**没有文件工具**，等于递「有地名、没地图」的纸——真正值钱的 canon 正文反而不在里面。
3. 工具 schema、`tool` 信封、`NG_*_MEMO` 对写手都是噪声。

> 所以"原生"该理解为**会话积累的语义状态**，不是 **API 原始字节**。正确动作是 **compile（抽取 + 解引用 + 排版），不是 dump**。

## 6. 编译器规格（抽取优先）

输入：`canon/`（冷）或 `this.messages`（热）。输出：一段可直接粘贴的提示词。**默认零生成或近零生成。**

| 动作 | 处理 |
|------|------|
| **丢弃** | 工具 schema；主系统提示（agent 版）；`NG_PROJECT_CONTEXT` 指针块；`NG_*_MEMO`；write/git/shell 类 tool 管道 |
| **解引用** | 把指针指向的 canon 文件**读出原文内联**（写手拿不到文件，必须给正文）|
| **逐字保留 + 去重** | canon 原文片段、上一章章尾原文、作者本章意图原文、旧正文样本；同一文件多次读取只留一份 |
| **不做** | ~~把会话来回总结成"创作决策"~~ → 改为**直接引用作者原话**；确需压缩时优先**字段抽取 / 截断**，不要生成式改写 |
| **失败回退** | 缺 canon / 找不到上一章 / 缺本章大纲时，输出"缺失项清单 + 需要作者补充的最小问题"，不要凭空补剧情或补设定 |
| **翻译黑话** | `fs:slug` / `sort_key` / `canon` / `candidate` / checker id 等内部标识不得漏进提示词（确定性替换，非改写）|
| **锚定专名** | 注入 `canon` 别名表当"用词表"，降低官网模型改名概率 |

### 输出结构（6 张卡，尽量逐字）

```
你是顶尖中文网文作者。写第 N 章正文，约 X 字，直接出正文，不解释。

【世界规则·用词表】   ← canon/settings + glossary 原文片段（含 aliases，固定专名）
【人物声音】          ← canon/characters 原文（仅本章出场者）
【接住上一章】        ← 上一章章尾原文（逐字末段）+ 钩子
【本章任务】          ← 作者本章意图 / 大纲原话：目标/阻力/代价/章末钩子
【绝对不能】          ← 未兑现伏笔 + 设定红线（防越级、防提前揭伏笔、防改数值）
【照这个文风写】      ← 一段作者满意的旧正文节选（逐字）
```

### 清洁度档位（默认翻转为抽取式）

- **默认 = 抽取式（零生成 / 近零生成）**：纯选取 + 排版 + 确定性翻译。无 AI 味、无走样。这是本设计推荐的常态。
- **`--polish`（可选，慎用）**：仅在素材太碎时，调一次本地模型做**轻收敛**（不重写事实、不补剧情、不新增设定、不代写正文）。默认关闭——把"要不要让 AI 动笔"交给作者显式选择。

### 模型适配 `--for`

| 目标 | 调整 |
|------|------|
| DeepSeek / Kimi / 豆包 / Qwen 网页 | 中文网感强、限制宽松，可更直接 |
| 长上下文官网模型 | XML 式结构标签；长上下文；卡片可上传到项目知识库 |
| ChatGPT | 走"自定义 GPT"：系统指令 + 知识文件 + 开场白 |
| Gemini / NotebookLM | 超长上下文，可整包 canon 上传 |

## 7. 落地：代码接缝

### 7.1 冷启动 `/handoff`（无需引擎状态）→ 技能实现

- 新增 `.novel-guide/skills/handoff/SKILL.md`，加进 `src/novel/templates.ts`（`NOVEL_DIRECTORIES` + `templateFiles`），随 `novel-init` 落地。
- 被 `skillToPromptCommand` 展开，交本地引擎用 file/search 工具**按抽取规则**拼 6 张卡。
- 手动放入现有项目时**零 TypeScript 改动**；若要随 `novel-init` 默认生成，需要改 `src/novel/templates.ts`。
- 定位：`/handoff` 只依赖文件当前状态，适合"从 canon + 上一章章尾 + 本章大纲编译下一章提示词"。

### 7.2 热导出 `/eject`（需要当前会话）→ 必须接在持久引擎上

**关键约束**：`cli.ts` 的 `runSlashCommand` 对每条命令 **new 一个全新 engine**（`cli.ts:49-67`），没有历史。因此 `/eject` 不能走那条路，**必须接在 `runRepl` 里那个长驻 `engine` 实例上**（`cli.ts:74`），否则拿不到 `this.messages`。

```ts
// engine.ts —— 只渲染不查询（dry-run）
async renderPortablePrompt(opts: {
  mode: "extract" | "polish";              // 默认 extract（零生成）
  target?: "deepseek" | "long-context" | "chatgpt" | "gemini";
  chapter?: number;
}): Promise<{ prompt: string; note: string }>;
```

- 复用：`buildProjectContext`（仅用于定位指针指向哪些 canon 文件，再**解引用读原文内联**）/ `estimateMessagesTokens`（给估算反馈）。
- `extract` 档**不调模型**；`polish` 档才复用一次 `summarizeForCompaction` 同款调用。
- **绝不进入 `queryEvents`。**
- 定位：`/eject` 会额外利用当前 REPL 会话里的临时意图、刚讨论过的计划和作者原话，适合"把热会话状态编译成可投喂提示词"。

REPL 加 `/eject [--polish] [--for=long-context]`（仿 `/clear`、`/exit` 拦截，`cli.ts:82-92`），输出写到 `handoff/ch{NN}-{target}.md` + 尝试塞剪贴板（Win `clip` / mac `pbcopy` / linux `xclip`，走现有 shell 工具）。

### 7.3 可选：`handoff-export` 内置命令

仿 `src/commands/builtin.ts` 的 `novel-init`，做文件 + 剪贴板的确定性输出（不依赖会话）。

## 8. 状态记账：把新章的"变化"喂回 canon（区别于回流校验）

§3 写死了：写下一章提示词需要 **canon delta + 上一章章尾**。本节回答那个 delta **由谁、怎么产生**。

### 8.1 先拆清"喂正文"其实是三件事

| 目的 | 要不要喂正文 | 处理 |
|------|------------|------|
| ① **状态推进**：抽出"突破/翻脸/伏笔回收/章尾钩子/时间推进"更新 canon | 要 | 本节 |
| ② **连续性校验**：跑 checker 挑毛病 | 不要（作者掌控内容）| 砍 |
| ③ **接住下一章**：下章要用"上一章章尾"原文 | 不用喂——读作者存的文件即可 | 免费 |

所以"要不要把新正文喂给 agent"≈ **要不要从新章抽 delta 更新 canon**。②③ 不构成理由。

### 8.2 决定性问题：作者会不会自己手维护 canon？

- 会 → ① 可选（手改即可）。
- 不会（多数人不会，且本工具卖点是"便捷减负"）→ **必须有 ① 的自动化**，否则 canon 一路漂、下章提示词越来越错、供给侧慢慢烂掉。而"准的提示词"正是产品本体。

### 8.3 推荐机制：readonly 子代理记账 + 只回 delta + 作者确认落盘

> 作者存好新章 → 主 agent 用**子代理**读它 → 子代理**只返回结构化 delta** → 主 agent 呈给作者 → **作者确认后，主 agent 才写 canon**。

```
作者存好新章
   │
   ▼
主 agent ──run_agent(记账子代理, readonly)──▶ 子代理：读全文 → 抽 delta
   │                                            （全文只活在子代理里，用完即弃）
   │◀──────────── 只回传 final text = delta ──────┘
   ▼
主 agent 拿到 delta（几百 token）→ 呈给作者 →（确认后）写 canon
```

**为什么是子代理、且只回 delta：**

- **硬约束：主 agent 不得直接 `read_file` 读取新章全文**；记账流程只能把新章路径交给 readonly 子代理，由子代理读取、抽取、丢弃全文。

- **正文被隔离**：整章（~1800 token）只活在子代理独立上下文；子代理 `save:false`、历史不并回主对话（`engine.ts:139`）；主 agent 只拿 `result.text`（`engine.ts:118-121`）。→ 主上下文从不碰正文，§3 有界成立。若让主 agent 直接 `read_file` 读全文，正文会进 `this.messages` 反复重发，正是要躲的坑。
- **子代理只提议、不落盘**：readonly（同四个 checker，`runSubAgent` 默认 `readonlyOnly`）。写入永远在作者确认之后，由主 agent 走 `propose_file_change` / `archive`。→ 作者掌控不破。

**满足四条约束：**

| 约束 | 如何满足 |
|------|---------|
| 上下文有界（§3）| 一次性单章读、子代理隔离、读完即弃，不累积 |
| 无 AI 味 | 做**结构化抽取**（境界?关系?伏笔?），非生成式总结；只动 canon 字段，不碰正文 |
| 作者掌控 | 子代理只提议；作者确认才写 |
| token | bounded、不累积；与 §4"省 token 是假的"不冲突——这是每章一次的有界成本，不是全书回灌 |

和"投喂官网"正交：外包的是**写正文**（图文笔），**没外包记账**——记账是本地 agent 又便宜又擅长的活。

### 8.4 实现坑

`runAgent` 那层**只回传 `result.text`**，子代理的 `result.proposals` 在边界会被丢。→ delta 必须放进子代理的**最终文本输出**（结构化，如一小段 JSON/markdown 清单），不能只塞 proposal 元数据。

### 8.5 顺手的副产品

子代理这一遍读取，可顺带用 `aliases` 表标出官网模型可能的**改名漂移**（林越→林宇），列进 delta 给作者——仍是"提议给作者"，不自动改。

### 8.6 仍然砍掉的

intake 校验、四 checker 体检、provenance 自动留痕、自动改 canon。需要时作为**独立**功能另议，不绑进本流程。

## 9. MVP 范围与里程碑

- **M0（今天可做）**：`/handoff` 技能模板（6 张卡 + **抽取式** + 黑话翻译表）。零引擎改动。
- **M1**：`engine.renderPortablePrompt`（dry-run，默认 `extract` 零生成）+ REPL `/eject`，输出文件 + 剪贴板。
- **M2**：`--for` 模型适配；**状态记账子代理**（readonly，只回 delta，作者确认落盘，§8）。
- **M3**：多轮增量 handoff（只发 canon 自上次的 diff，适配长对话的官网会话）。

## 10. 取舍与开放问题

- **默认 `extract` 已定**：常态零生成，`--polish` 显式开启。（解决 AI 味/走样）
- **回流校验已砍，状态记账保留**：不做 checker 校验/自动 provenance；但"把新章变化记进 canon"列为**默认推荐**——readonly 子代理抽 delta、作者确认落盘（§8）。否则 canon 漂、下章提示词烂。
- **上下文模型已锁**：canon + 上一章章尾 + 本章大纲，正文在文件。（解决"上下文没弄透"；连带把"省 token"降级为次要收益）
- **解引用深度**：仅本章活跃实体 + 未兑现伏笔 + 上章章尾，不整库内联。
- **记账 delta 的 schema**：定一个最小结构（状态变化/关系/伏笔进展/章尾钩子/时间锚点/疑似改名），让子代理输出稳定、主 agent 好落盘。（待定）
- **剪贴板跨平台**：走 shell 调系统命令，失败回退"打开文件自己复制"。
- **`章节正文/` 摘录注入**：复核 `summarizeLegacyLgMaterials` 是否需要随章数增长而收紧上限（与 §3 原则一致即可）。
- **会话加载**：REPL 每次新建 session、不自动 load 旧 session；若要 `/eject` 跨重启可用，需另补"加载指定 session"。
