# Claude Code 执行指挥

> 项目：LG
> 目标：按小步闭环把现有前端逐步接成可用的 AI 书籍系统管理工作台。
> 执行原则：一次只做一个可验证的小功能，不做大重构，不提前引入复杂基础设施。

---

## 0. 必读上下文

开始任何实现前，先阅读：

- `plan/设计.md`
- `plan/LG_上下文压缩与索引刷新策略.md`
- 当前代码结构：
  - `app/page.tsx`
  - `components/lg/*`
  - `lib/api.ts`
  - `lib/mock-data.ts`
  - `package.json`

当前前端已经基本成型，重点不是重做 UI，而是逐步替换 mock 数据、补齐本地数据层和 API。

---

## 1. 总体路线

按以下顺序推进：

1. 建立共享类型与本地文件数据层
2. 用真实 API 替换 mock 书籍/章节数据
3. 做工作台 Markdown 文件读写
4. 做新建书籍流程
5. 做 Ledger 操作日志
6. 做 ActionPlan 展示与确认执行闭环
7. 做 dirty 标记与时间戳/关键词召回
8. 做剧情设计 Skill Skill 管道
9. 最后再接真正的 LLM、向量库和图谱能力

不要跳步。每一步都要能运行、能验证、能回退。

---

## 2. 工程约束

- 使用现有 Next.js 项目结构。
- UI 继续沿用现有 `components/ui/*` 和 `components/lg/*` 风格。
- 不引入数据库作为第一步依赖，先使用本地文件系统。
- 不改动无关 UI 细节。
- 不删除已有 mock 数据，直到真实 API 完整替代。
- 每次完成后运行：

```bash
pnpm lint
pnpm build
```

如命令失败，先修复本次改动导致的问题。

---

## 3. 数据目录约定

第一期使用本地目录：

```text
data/
├── books/
│   └── {bookId}/
│       ├── book.json
│       ├── 人物设定/
│       ├── 世界观/
│       ├── 章节大纲/
│       ├── 剧情设计指南.md
│       ├── 关系图谱.json
│       ├── ledger.jsonl
│       └── skills/
│           └── 剧情设计指南.md
└── index/
    └── dirty-files.json
```

`data/` 后续是否提交到 Git，按实际需要决定。若放示例数据，优先使用 `data/sample` 或明确的 demo book。

---

## 4. 第一阶段：真实数据底座

### 4.1 目标

把项目从“纯前端 mock”推进到“本地文件驱动”。

### 4.2 需要新增

建议新增：

```text
lib/types.ts
lib/server/book-store.ts
app/api/books/route.ts
app/api/books/[bookId]/tree/route.ts
app/api/books/[bookId]/file/route.ts
```

如现有项目已有类似结构，优先复用，不强行照搬文件名。

### 4.3 类型草案

```ts
export interface Book {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  rootPath: string
}

export interface BookTreeNode {
  id: string
  name: string
  path: string
  type: "file" | "directory"
  children?: BookTreeNode[]
  updatedAt?: string
}

export interface BookFile {
  bookId: string
  path: string
  content: string
  updatedAt: string
}
```

### 4.4 API 草案

```text
GET  /api/books
返回书籍列表

POST /api/books
创建书籍基础目录

GET  /api/books/{bookId}/tree
返回书籍文件树

GET  /api/books/{bookId}/file?path=...
读取单个 markdown/json 文件

PUT  /api/books/{bookId}/file
写入文件内容
body: { path: string, content: string }
```

### 4.5 验收标准

- 页面能通过 API 读取书籍列表。
- 左栏能显示真实书籍和文件树。
- 读取文件 API 能返回 Markdown 内容。
- 写入文件 API 能更新本地文件。
- 没有破坏现有页面布局。
- `pnpm lint` 和 `pnpm build` 通过。

---

## 5. 第二阶段：工作台文件编辑

### 5.1 目标

工作台能真实编辑书籍内的 Markdown 文件。

### 5.2 实现范围

- 文件树点击文件后加载内容。
- 中间编辑器显示 Markdown。
- 编辑后保存到对应文件。
- 保存后更新 `updatedAt`。
- 保存后标记 dirty。

### 5.3 暂不做

- Monaco / CodeMirror 深度集成
- 富文本
- 复杂 diff
- 回滚

先用现有 textarea 或轻量编辑器完成闭环。

---

## 6. 第三阶段：新建书籍

### 6.1 目标

点击“新建书籍”能创建真实目录。

### 6.2 默认结构

```text
{bookTitle}/
├── book.json
├── 人物设定/
├── 世界观/
├── 章节大纲/
├── 剧情设计指南.md
├── 关系图谱.json
├── ledger.jsonl
└── skills/
    └── 剧情设计指南.md
```

### 6.3 验收标准

- 创建后左栏自动出现新书。
- 能立即进入工作台编辑文件。
- `book.json` 写入基础元数据。

---

## 7. 第四阶段：Ledger

### 7.1 目标

任何程序写入都记录操作日志。

### 7.2 类型草案

```ts
export interface LedgerEntry {
  id: string
  bookId: string
  timestamp: string
  actor: "user" | "agent"
  action: string
  targetPath: string
  beforeSnapshot?: string
  afterSnapshot?: string
  summary: string
}
```

### 7.3 规则

- 工作台手动保存也要写 Ledger。
- ActionExecutor 执行必须写 Ledger。
- 先只做追加写入 `ledger.jsonl`，不做回滚。

---

## 8. 第五阶段：ActionPlan 闭环

### 8.1 目标

用户输入请求后，系统生成可确认计划；用户确认后程序执行。

### 8.2 第一版可以是规则驱动

不要一开始就接 LLM。先针对明确句式做规则解析，例如：

```text
把林晓改成女的
把林晓和陈磊关系改成敌对
```

生成结构化 ActionPlan，展示在右栏。

### 8.3 类型草案

```ts
export interface ActionNode {
  id: string
  type: "group" | "action"
  label: string
  scopePath: string
  targetBlock?: string
  affectedChapters?: string[]
  operation: "create" | "update" | "delete" | "check"
  childCount?: number
  riskLevel?: "low" | "medium" | "high"
  status: "pending" | "running" | "done" | "failed"
  children?: ActionNode[]
}

export interface ActionPlan {
  id: string
  bookId: string
  taskSummary: string[]
  contextUsed: string[]
  boundaries: string[]
  missingInfo: string[]
  nodes: ActionNode[]
  status: "draft" | "confirmed" | "running" | "done" | "failed"
}
```

### 8.4 验收标准

- 右栏能展示待确认计划。
- 用户可确认/放弃。
- 确认后执行文件修改。
- 执行后写 Ledger。
- 执行后更新 ActionNode 状态。

---

## 9. 第六阶段：dirty 标记与召回基础

### 9.1 目标

为后续 Agent 上下文准备基础索引。

### 9.2 第一版实现

- `dirty-files.json` 记录被修改文件。
- 文件保存后标记 dirty。
- 下一次对话前扫描 dirty。
- 暂时只做关键词索引和时间排序。

### 9.3 暂不做

- embedding
- Qdrant / Weaviate
- 图数据库

---

## 10. 第七阶段：Skill 剧情设计 Skill

### 10.1 目标

实现剧情设计 Skill缓存管道。

### 10.2 第一版

- 检测 `剧情设计指南.md` 修改时间。
- 修改后设置 `Skill.dirty = true`。
- 提供“更新 Skill”按钮。
- 暂时可用规则摘要或占位摘要。
- 后续再接 LLM 生成 500 token 内摘要。

### 10.3 注入规则

对话上下文只读：

```text
剧情设计指南.md
```

不把完整 `剧情设计指南.md` 塞进对话上下文。

---

## 11. 当前立即执行任务

请先做第一阶段的最小闭环：

1. 新增共享类型。
2. 新增本地 `BookStore`。
3. 新增 `GET /api/books`。
4. 新增 `POST /api/books`。
5. 新增 `GET /api/books/{bookId}/tree`。
6. 新增 `GET/PUT /api/books/{bookId}/file`。
7. 准备一个 demo book 数据。
8. 让左栏书籍/章节树优先读取 API，失败时再回退 mock。
9. 跑 `pnpm lint` 和 `pnpm build`。

完成后停止，汇报：

- 改了哪些文件
- 新增了哪些 API
- 如何手动验证
- 哪些地方仍然使用 mock
- 下一步建议做什么

---

## 12. 不要做的事

- 不要重写整个前端。
- 不要一次性接 LLM。
- 不要立刻引入向量数据库。
- 不要把写作台升级成复杂富文本。
- 不要做大型状态管理迁移。
- 不要改动与本阶段无关的视觉样式。

每一步只追求一个结果：可运行、可验证、可继续叠下一层。
