# 把提示词喂给官网大模型：Handoff / Eject 设计与实现现状

> 状态：设计与实现现状
> 适用：`packages/novel-guide`
> 关联模块：`src/novel/templates.ts`、`src/handoff/render.ts`、`src/commands/builtin.ts`、`src/agent/engine.ts`

## 1. 背景与定位

Novel Guide 的定位是「便捷用户」，不是抢着自己写。外部官网模型（ChatGPT / Gemini / DeepSeek 网页版 / Kimi / NotebookLM 等）在纯正文文笔、长上下文项目、或用户已付费模型上常常更合适；本地 Novel Guide 更擅长检索、状态管理、正典维护和提示词编译。

核心诉求：

> 把“现在该写什么、必须遵守什么、刚才聊到哪里了”打包成干净材料，交给外部模型写或续。

当前设计固定为两个出口：

| 命令 | 定位 | 适合场景 | 默认输出 |
|------|------|----------|----------|
| `/handoff` | 冷启动、文件态、抽取式 6 张卡 | 纯粘贴给外部模型；需要内联 canon/章尾/大纲 | Markdown 提示词 |
| `/eject` | 热会话、当前 REPL 状态、上传包 | 把当前讨论接力到 ChatGPT/Gemini/NotebookLM/新会话 | `handoff/<name>/` + `handoff/<name>.zip` |

这不是两个名字做同一件事：`/handoff` 负责“把文件事实编译成提示词”，`/eject` 负责“把当前会话和相关文件打成可上传包”。

## 2. 落地状态

| 项目 | 状态 | 现状 |
|------|------|------|
| M0 `/handoff` 技能 | ✅ 已实现 | `HANDOFF_SKILL_MD` 随 `novel-init` 落地，输出 6 张卡。 |
| M1 `/eject` 文件导出 | ✅ 已实现 | `renderEjectHandoff` + builtin `/eject`，导出当前 REPL 会话。 |
| M1 剪贴板 | ✅ 已实现 | `/eject --copy` 复制 prompt 内容，失败时提示手动复制。 |
| M1 上传包易用化 | ✅ 已实现 | 普通 `/eject` 默认生成 package 目录和 zip；`--inline` 才回到单 markdown。 |
| M2 `--for` profile | ✅ 已实现 | 支持 `chatgpt`、`gemini`、`notebooklm`、`long-context`、中文网页模型等 profile。 |
| M2 状态记账子代理 | ✅ 已实现基础件 | `/chapter-delta <draft-path>` 调 readonly 子代理，只回结构化 delta。 |
| 作者确认后写 canon | ⚠️ 两段式 | 先跑 `/chapter-delta`，再由作者确认，让主 agent 提议或写 canon；尚未做成一个自动闭环。 |
| 存稿后自动提醒/钩子 | ⬜ 待做 | 当前靠命令输出提示用户运行 `/chapter-delta <draft-path>`。 |

## 3. 上下文模型

写任意一章需要的是有界状态，不是前面所有章节正文：

| 需要 | 来源 | 处理 |
|------|------|------|
| 项目信息、题材、承诺 | `NOVEL.md` / `GUIDE.md` | 默认入口文件 |
| 世界规则、专名、红线 | `canon/` / `glossary` | 按目标检索或上传 |
| 人物声音、关系 | 相关 `canon/characters` | 只取本章相关项 |
| 接住上一章 | 上一章章尾 | 需要时只摘末段 |
| 本章任务 | 大纲、作者原话、候选设定 | 保留作者意图 |

正文永远优先留在文件里。长篇变长时，增加的是 `drafts/` 文件和小规模 canon delta；每章提示词需要的上下文应当随“活跃实体和目标”增长，而不是随全书章数线性增长。

`NG_PROJECT_CONTEXT` 是导航索引，不是事实正文。它能告诉本地 agent “哪些文件值得读”，但外部模型没有本地工具，所以不能把它当成可直接投喂的写作提示词。

## 4. Token 账

把正文生成交给外部官网模型，稳定收益不是“大幅省本地 token”，而是：

1. 外部模型的正文能力可能更适合。
2. 本地上下文保持干净，Novel Guide 专注状态、正典、检索、提示词。
3. 作者继续掌控成稿，不把正文质量判断强绑在本地模型上。

“正文堆在上下文里被反复重发”本来就不该发生；靠正确上下文模型即可避免，和正文是在本地写还是外部写无关。

## 5. 为什么不能 dump 原生 prompt

`AgentEngine` 每轮会把系统提示、项目上下文索引、历史消息、工具 schema、工具结果等组装给本地模型。这些内容直接贴给官网模型是错的：

- 主系统提示是给“带工具的工作区 agent”的，不是给写手的。
- `NG_PROJECT_CONTEXT` 多是路径和摘要指针；外部模型没有 `read_file`。
- 工具 schema、tool 信封、`NG_*_MEMO` 对外部写手是噪声。

正确动作是 compile：根据目标选择材料，必要时解引用文件，排版成人能用、模型能执行的提示词或上传包。

## 6. `/handoff` 与 `/eject` 的分工

### `/handoff`：冷启动 6 张卡

`/handoff` 由技能模板实现，依赖工作区文件当前状态，不依赖当前 REPL 会话历史。它适合“我要一个可直接粘贴的写作提示词”。

6 张卡以模板为准：

1. **任务卡**：这次要写/改/续的章节或目标，以及外部模型应扮演的角色。
2. **项目卡**：题材、基调、视角、当前章节位置、读者承诺。
3. **正典卡**：本次必须遵守的人物、关系、设定、时间线和红线，只列相关项。
4. **承接卡**：上一章章尾、未解决冲突、正在推进的情绪/信息差。
5. **本章卡**：本章大纲、必须出现/不能提前揭示的内容、伏笔推进要求。
6. **写法卡**：文风参考、节奏要求、输出格式和“不要做什么”。

在这个模式里，“给正文不给指针”是原则：纯粘贴目标拿不到文件工具，所以应尽量把必要事实内联进提示词。

### `/eject`：热会话上传包

`/eject` 读取当前 REPL 的消息快照，提取最近用户意图、助手结论、会话里提到的文件路径，并默认复制核心文件与引用文件到上传包。

普通用法：

```text
/eject ch12 --for chatgpt
```

默认产物：

```text
handoff/ch12-chatgpt/
  prompt.md
  README.md
  manifest.json
  files/
    NOVEL.md
    GUIDE.md
    ...
handoff/ch12-chatgpt.zip
```

`/eject` 不默认内联全量 canon，因为它的目标是“上传包”，不是“纯粘贴单 prompt”。外部模型能读上传文件时，给 package 比把所有内容塞进一个巨大 markdown 更易用，也更少走样。

需要单文件时：

```text
/eject ch12 --for chatgpt --inline
```

## 7. `/eject` 参数与文件策略

| 参数 | 行为 |
|------|------|
| 无额外参数 | 默认生成 package 目录 + zip。 |
| `--for chatgpt/gemini/notebooklm/long-context/...` | 调整 profile 文案。 |
| `--copy` | 把 `prompt.md` 内容复制到剪贴板。 |
| `--no-zip` | 生成 package 目录，但不生成 zip。 |
| `--inline` | 只生成单个 markdown，不复制文件、不生成 zip。 |
| `--bundle` / `--copy-files` | 兼容旧用法；现在普通 `/eject` 已默认 bundle。 |
| `--no-bundle` | 禁用 package，退回单文件 handoff。 |
| `--polish` | 显式调用一次本地模型轻收敛，不允许新增事实。 |

默认复制文件：

- `NOVEL.md`
- `GUIDE.md`
- 最近会话中识别到的 `canon/`、`candidates/`、`drafts/`、`handoff/`、`archive/`、`inbox/`、`.novel-guide/` 文件

路径必须解析在 workspace 内部；带 `..` 或越界的路径不会进入复制列表。缺失文件不会静默吞掉，会写入：

```text
handoff/<name>/manifest.json.missing
```

命令输出会直接告诉用户：

- 上传哪个 zip
- 不支持 zip 时上传哪个目录
- prompt 在哪里
- 哪些文件缺失
- 保存新章后可运行 `/chapter-delta <draft-path>`

## 8. 状态记账

外部模型写正文后，作者通常会把新章保存回 `drafts/`。为了让下一章 handoff 继续准确，需要把新章造成的状态变化记进 canon。

当前实现是两段式：

```text
作者保存新章
  -> /chapter-delta <draft-path>
  -> readonly 子代理读取正文并只返回 delta
  -> 作者确认
  -> 主 agent 提议或写入 canon
```

这里的关键是：记账流程应通过 readonly 子代理读新章全文，主对话只拿结构化 delta。`runReadonlySubAgent` 使用独立子引擎，最终只返回文本；因此 delta 必须出现在子代理最终回复里，不能只放 proposal 元数据。

注意：这不是全局工具层硬约束。普通对话里主 agent 仍然拥有文件读取能力；“主流程不直接读整章正文”是 `/chapter-delta` 记账流程的约束。

## 9. 实现接缝

- `/handoff`：由 `HANDOFF_SKILL_MD` 作为技能模板落地，走普通 prompt command 展开。
- `/eject`：由 `renderEjectHandoff` 生成 prompt/readme/manifest 内容，builtin 命令负责写文件、复制引用文件、生成 zip、复制剪贴板。
- `/chapter-delta`：builtin 命令调用 `runReadonlySubAgent`，子代理模板由 `CHAPTER_DELTA_AGENT_MD` 提供 JSON-in-markdown 输出结构。
- profile：`parseEjectArgs` 负责 `--for`、`--inline`、`--no-zip`、`--copy` 等参数解析。

避免在文档里依赖裸行号；代码移动频繁时，函数名和模块名比行号更可靠。

## 10. 仍需改进

- 给“保存新章后运行 `/chapter-delta`”做更自然的 nudge 或 hook，降低用户忘记记账导致 canon 漂移的概率。
- 如有纯粘贴强需求，可增强 `/eject --inline` 的解引用能力；默认 `/eject` 仍保持上传包职责。
- 如果未来需要跨重启接力，可补“加载指定 session 后 eject”的能力。
- `summarizeLegacyLgMaterials` 对旧 `章节正文/` 的摘录上限应继续保持有界，避免旧材料随书长无限进入上下文。
