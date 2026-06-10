# LG — AI 写作工作台

一个基于 Next.js 的小说创作辅助工具,帮助作者管理设定、组织章节、与 AI 对话讨论剧情,并在写作台中进行 AI 试写。

## 已完成能力

- **对话系统**：与 AI 对话讨论剧情、查询设定、执行修改。Agent 自动识别意图,区分"查询"和"修改"两类操作。
- **书籍管理**：创建书籍,每本书独立管理设定、章节、世界观。
- **设定卡片**：自动从 `人物设定/*.md` 和 `世界观/*.md` 生成设定卡片,支持按名称筛选。
- **章节系统**：章节以 `章节正文/*.md` 文件存储,支持创建、编辑、自动保存。
- **写作台**：独立写作界面,带工具栏、字数统计、2 秒自动保存。底部有试写沙盒。
- **AI 试写**：基于当前章节上下文和创作指南,调用 LLM 生成 300-600 字续写文本。试写不写入正文,确认后才保留。
- **工作台**：以树状结构浏览书籍目录下所有文件,支持查看和编辑。
- **变更记录**：所有文件修改自动记录到 `ledger.jsonl`。
- **脏文件追踪**：修改过的文件会被标记,用于后续 AI 检索上下文。

## 启动流程

```bash
pnpm install
pnpm seed
cp .env.example .env
pnpm dev
```

- `pnpm seed` 生成一本示例书籍 "归墟之外",包含人物设定、世界观、两章正文和对话记录。
- `.env` 中配置 LLM API key,否则 AI 功能使用 mock fallback。

## LLM 配置

在 `.env` 中设置:

```
LLM_PROVIDER=mimo          # 或 deepseek
MIMO_API_KEY=your-key
DEEPSEEK_API_KEY=your-key
```

支持的 Provider:

| Provider | 模型 | 环境变量 |
|----------|------|----------|
| MiMo | mimo-v2.5-pro | `MIMO_API_KEY`, `MIMO_BASE_URL` |
| DeepSeek | deepseek-v4-flash | `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` |

未配置 API key 时,AI 对话和试写功能会返回 fallback 文本,不会报错。

## 示例数据

`pnpm seed` 生成的数据结构（默认位于仓库根目录的 `.lg-data/` 下）:

```
.lg-data/books/demo-guixu/
  book.json                 # 书籍元数据
  创作指南.md               # 写作风格要求
  关系图谱.json             # 人物关系
  人物设定/
    林晓.md                 # 角色设定
    陈磊.md
    沈芙蓉.md
  世界观/
    规则体系.md
    地图.md
  章节大纲/
    第一章.md
    第二章.md
  章节正文/
    第一章 · 归墟初见.md    # 正文内容
    第二章 · 旧账新算.md
  skills/
    style_guide_summary.md  # 创作指南摘要(自动生成)
  ledger.jsonl              # 变更记录
  messages.jsonl            # 对话历史
```

## 数据目录

所有书籍运行时数据默认存储在仓库根目录的 `.lg-data/books/` 下,每本书一个目录。没有数据库,纯文件系统。

可通过 `LG_DATA_DIR` 覆盖数据根目录。旧版 `apps/lg/data/` 目录只用于迁移兼容,运行时代码不再从那里读取。

- `book.json` — 书籍元数据 (id, title, createdAt, updatedAt)
- `章节正文/*.md` — 每个文件是一章正文
- `messages.jsonl` — 对话历史,每行一条 JSON
- `ledger.jsonl` — 变更记录,每行一条 JSON
- `skills/` — 自动生成的技能摘要

## 主要 API

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/books` | 列出所有书籍 |
| POST | `/api/books` | 创建书籍 |
| GET | `/api/books/[id]/chapters` | 列出章节 |
| POST | `/api/books/[id]/chapters` | 创建章节 |
| GET | `/api/books/[id]/chapters/[cid]` | 读取章节正文 |
| PUT | `/api/books/[id]/chapters/[cid]` | 保存章节正文 |
| POST | `/api/books/[id]/chapters/[cid]/draft` | AI 试写 |
| POST | `/api/books/[id]/messages` | 发送对话消息 |
| GET | `/api/books/[id]/setting-cards` | 获取设定卡片 |
| GET | `/api/books/[id]/tree` | 获取文件树 |
| GET | `/api/books/[id]/file` | 读取文件 |
| PUT | `/api/books/[id]/file` | 写入文件 |
| GET | `/api/books/[id]/ledger` | 获取变更记录 |
| POST | `/api/books/[id]/retrieve` | 检索相关上下文 |
| GET | `/api/books/[id]/skills/style-guide` | 获取创作指南摘要 |
| POST | `/api/books/[id]/skills/style-guide/refresh` | 刷新摘要 |

## 当前限制

- 无用户认证,所有数据本地存储。
- LLM 调用使用 OpenAI 兼容 API,需要自行提供 API key。
- 对话 Agent 的意图识别基于关键词匹配,复杂语义可能误判。
- 暂无导出/导入功能。
- 工具栏按钮(加粗、斜体等)暂未实现实际功能。
