# LG — AI 写作工作台

一个基于 Next.js 的小说创作辅助工具,帮助作者管理设定、组织章节、与 AI 对话讨论剧情,并在写作台中进行 AI 试写。

## 已完成能力

- **对话系统**：与 AI 对话讨论剧情、查询设定、执行修改。Agent 自动识别意图,区分"查询"和"修改"两类操作。
- **书籍管理**：创建书籍,每本书独立管理设定、章节、世界观。
- **设定卡片**：自动从 `人物设定/*.md` 和 `世界观/*.md` 生成设定卡片,支持按名称筛选。
- **章节系统**：章节以 `章节正文/*.md` 文件存储,支持创建、编辑、自动保存。
- **写作台**：独立写作界面,带工具栏、字数统计、2 秒自动保存。底部有试写沙盒。
- **AI 试写**：基于当前章节上下文和剧情设计指南,调用 LLM 生成 300-600 字续写文本。试写不写入正文,确认后才保留。
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
- `.env` 中配置 `APP_ENCRYPTION_KEY` 和 `LG_ADMIN_EMAILS`。邀请码可在 `/admin` 生成并单独设置人数上限；`LG_INVITE_CODES` 仅作为旧环境变量邀请码兼容入口。DeepSeek API Key 登录后在设置页按用户配置。

## LLM 配置

DeepSeek API Key 不再写入 `.env`,而是在 `/settings` 中由每个用户自行保存。服务端只保存加密后的密文和末尾预览,不会向前端回显原文。

生产环境需要在 `.env` 中设置:

```
APP_ENCRYPTION_KEY=your-stable-32-byte-key
# 可选：旧环境变量邀请码；新邀请码建议在 /admin 生成
LG_INVITE_CODES=invite-one,invite-two
LG_ADMIN_EMAILS=admin@example.com
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_PLATFORM_API_KEY=
```

未配置个人 DeepSeek API Key 时,如果后台启用了平台试用额度且额度未用完,AI 请求会使用 `DEEPSEEK_PLATFORM_API_KEY`；否则会提示前往设置页配置个人 Key。

## 后台

`/admin` 仅允许 `LG_ADMIN_EMAILS` 中的账号访问。当前后台提供内测用户、邀请码生成与人数上限配置、活跃 session、用户数据占用、个人模型 Key 配置状态和平台试用额度设置。

平台额度启用条件:

- `.env` 中配置 `DEEPSEEK_PLATFORM_API_KEY`。
- 后台开启“启用平台试用额度”。
- 后台设置总额度、单用户额度、缓存命中输入、缓存未命中输入、输出 token 单价。
- 用户没有保存个人 DeepSeek API Key。

平台额度配置保存到 `.lg-data/admin/quota-settings.json`,用量记录保存到 `.lg-data/admin/quota-usage.jsonl`。费用按 `prompt_cache_hit_tokens`、`prompt_cache_miss_tokens` 和 `completion_tokens` 分别计价。

## 示例数据

`pnpm seed` 生成的数据结构（登录用户运行时默认位于仓库根目录的 `.lg-data/users/<userId>/` 下）:

```
.lg-data/users/<userId>/books/demo-guixu/
  book.json                 # 书籍元数据
  剧情设计指南.md               # 剧情设计指南
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
  skills/                   # 书籍 Skill 元数据
  ledger.jsonl              # 变更记录
  messages.jsonl            # 对话历史
```

## 数据目录

所有书籍运行时数据默认存储在仓库根目录的 `.lg-data/users/<userId>/books/` 下,每个用户独立目录。认证数据存储在 `.lg-data/auth/auth.json`。没有数据库,纯文件系统。

可通过 `LG_DATA_DIR` 覆盖数据根目录。生产部署时应把该目录挂载到持久磁盘。旧版 `apps/lg/data/` 目录只用于迁移兼容,运行时代码不再从那里读取。

从无认证版本升级后,可先注册目标账号,再迁移旧全局数据:

```bash
pnpm --filter lg migrate:global-user -- --email you@example.com
```

- `book.json` — 书籍元数据 (id, title, createdAt, updatedAt)
- `章节正文/*.md` — 每个文件是一章正文
- `messages.jsonl` — 对话历史,每行一条 JSON
- `ledger.jsonl` — 变更记录,每行一条 JSON
- `skills/` — 书籍 Skill 元数据

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

## 当前限制

- 内置账号体系适合早期公开上线；注册限制为 QQ 邮箱，并通过后台生成的邀请码控制。
- LLM 调用使用 DeepSeek/OpenAI 兼容接口,需要每个用户在设置页自行提供 API key。
- 后台已接入邀请码生成、人数上限配置和平台额度设置,尚未接入用户删除和数据导出。
- 文件存储依赖持久磁盘；Serverless/Vercel 部署需要额外改造数据库或对象存储。
- 对话 Agent 的意图识别基于关键词匹配,复杂语义可能误判。
- 暂无导出/导入功能。
- 工具栏按钮(加粗、斜体等)暂未实现实际功能。
