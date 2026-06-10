# pnpm dev 资源爆炸与架构优化计划

日期：2026-05-26

## 结论先行

当前项目真正需要优化的是 `lg` 这个 Next.js 应用，不是外层 `C:\Users\qdz\Desktop\cli` 目录，也不是旁边的 `codex` 仓库。

这次排查没有在“单纯启动 dev server”阶段复现 CPU/内存打爆。受控启动 `next dev --port 3099` 10 秒后强制终止，Next 16.2.6 Turbopack 在未访问页面时表现正常：入口进程约 50-60MB，编译子进程最高私有内存约 380MB，启动日志为 `Ready in 661ms`。

因此最可能的爆点不是 `pnpm dev` 命令本身，而是以下组合在页面访问、热更新、自动保存、AI 检索或工作台打开后触发：

1. 运行时数据 `data/` 放在 Next 项目根目录内，dev server 可能把运行时文件写入当作可观察文件变化。
2. `.next/dev/types/**/*.ts` 被写进 `tsconfig.json` 的 include，生成物会进入 TypeScript 语言服务/类型检查范围。
3. 自动保存每 2 秒写正文，同时 `writeBookFile()` 还写 `dirty-files.json`、`book.json`、`ledger.jsonl`，一次保存会变成多次磁盘写入。
4. `ledger.jsonl` 记录完整 before/after 快照，正文越长，自动保存越频繁，ledger 越容易指数式变大。
5. Workbench、retrieval、system check 多处全量扫目录/全量读文件，没有索引和缓存。
6. `app/page.tsx` 是大客户端入口，直接拉起聊天、写作台、工作台、右侧栏和大量 UI 依赖，dev 首次页面编译成本偏高。
7. 类型错误被 `next.config.mjs` 的 `typescript.ignoreBuildErrors: true` 掩盖，导致系统在不健康状态下继续运行。

## 已确认事实

项目位置：

- 外层目录：`C:\Users\qdz\Desktop\cli`
- 主要问题项目：`C:\Users\qdz\Desktop\cli\lg`
- `lg/package.json` 的 `dev` 脚本：`next dev`
- Next 版本：`next@16.2.6`
- React 版本：`react@^19`
- pnpm 版本声明：`pnpm@10.27.0`

目录与体量：

- `.next/`：1257 个文件，约 216.8MB
- `data/`：34 个文件，约 6.8KB，当前很小，但会随写作、消息、ledger 增长
- `plan/`：19 个文件，约 142KB
- 最大源码文件：
  - `lib/server/action-plan.ts`：1169 行
  - `components/lg/workbench.tsx`：556 行
  - `lib/api.ts`：390 行
  - `app/api/books/[bookId]/messages/route.ts`：315 行

受控启动采样：

- 采样命令：`node node_modules/next/dist/bin/next dev --port 3099`
- 采样约束：`NODE_OPTIONS=--max-old-space-size=1024`
- 采样结果：未访问页面时内存稳定，没有持续 CPU 风暴
- 日志文件：
  - `plan/dev-startup.stdout.log`
  - `plan/dev-startup.stderr.log`

类型检查：

`pnpm exec tsc --noEmit --pretty false` 当前失败，核心错误包括：

- `app/api/books/[bookId]/messages/route.ts` 里的 `brief` 缺少必填 `contextPaths`
- fallback intent 数组推断出的 `checkType: string` 不能赋给 `SystemCheckType`
- `lib/server/action-plan.ts` 的 `ParsedIntent` 缺少 `event` 字段
- `lib/server/system-check-service.ts` 有 “always truthy” 表达式

ESLint：

- `pnpm exec eslint . --no-error-on-unmatched-pattern` 当前通过

## 根因优先级

### P0：运行时数据在 Next 项目根目录内

当前所有书籍、消息、ledger、dirty index 都写到：

```text
data/books/
data/index/dirty-files.json
```

Next dev/Turbopack 的工作模式是监控项目根内的文件变化来做增量编译和缓存校验。即使 `data/` 被 `.gitignore` 忽略，也不等于 dev server 不会看到它。写作台自动保存、工作台保存、消息写入、ledger append 都会在项目根内制造文件变化。

这会形成高风险反馈环：

```text
用户输入
-> 自动保存
-> 写正文
-> 写 dirty index
-> 写 book.json
-> append ledger
-> dev server 看到项目内文件变化
-> invalidate / typegen / refresh
-> 页面或 API 重新请求
-> 更多读写
```

### P0：自动保存写放大

`components/lg/writing-desk.tsx` 中正文变更后 2 秒自动保存：

```text
content change -> saveChapter()
```

`saveChapter()` 最终进入 `writeBookFile()`，一次正文保存实际会做：

```text
read before snapshot
write chapter file
write data/index/dirty-files.json
read/write book.json
append ledger.jsonl with beforeSnapshot + afterSnapshot
```

如果正文越来越长，ledger 每次保存都带完整正文快照，会迅速变成巨型 JSONL。下一次打开 ledger、读取上下文、系统检查时又会把这些大文件读进内存。

### P0：TypeScript include 包含 dev 生成物

当前 `tsconfig.json`：

```json
"include": [
  "next-env.d.ts",
  "**/*.ts",
  "**/*.tsx",
  ".next/types/**/*.ts",
  ".next/dev/types/**/*.ts"
]
```

问题：

- `**/*.ts` 和 `**/*.tsx` 过宽，会把项目根下不该参与应用类型检查的文件卷入。
- `.next/dev/types/**/*.ts` 是 dev 生成物，dev server 改它，TypeScript 又读它，容易制造循环压力。
- `.next/` 当前已经 216MB，任何工具误扫都会很重。

### P1：大客户端入口导致首次页面访问编译成本高

`app/page.tsx` 是 `"use client"`，并直接 import：

- `LeftSidebar`
- `ChatPanel`
- `RightSidebar`
- `WritingDesk`
- `Workbench`
- `lib/api`

`lib/api.ts` 又 import 了 mock 数据和大量类型/函数。结果是页面首屏会把聊天、写作台、工作台、右栏等全部纳入客户端编译路径。访问页面后 CPU/内存比单纯启动 dev server 高很多是合理结果。

### P1：服务端模块职责过大，热更新代价高

`lib/server/action-plan.ts` 同时承担：

- 正则意图解析
- ActionPlan 生成
- pending plan 持久化
- 文件执行器
- 系统检查调度
- 节点确认/放弃

`app/api/books/[bookId]/messages/route.ts` 又复制了大量 fallback regex。任何改动都会让一个巨型模块和多个 route 一起重新编译，热更新成本偏高，也更容易出现类型漂移。

### P1：检索与工作台都是全量文件系统模型

当前典型链路：

- `GET /api/books/[bookId]/tree` -> `getBookTree()` 递归走完整书籍目录。
- `retrieveContext()` -> `getBookTree()` -> flatten -> 对候选文件读内容匹配关键词。
- `generateSystemCheckReport()` -> 每次根据检查类型重新读多个目录和文件。

当前 `data/` 小，所以看不明显。一旦用户开始真实写长篇，章节、摘要、检查报告、ledger、messages 增长后，这些全量读会成为内存和 CPU 的主因。

### P2：类型错误被构建配置隐藏

`next.config.mjs`：

```js
typescript: {
  ignoreBuildErrors: true,
}
```

这会让生产构建在类型错误存在时继续完成。对当前问题更重要的是：错误状态会让 dev 的编辑器、tsserver、Next 类型插件反复工作，表现成 CPU 占用持续偏高。

### P2：编码/文本质量债

大量中文字符串已经显示为乱码。这不一定是 CPU 根因，但会影响：

- 正则意图识别的可靠性
- 路径名匹配
- LLM prompt 质量
- 排错效率

架构优化时需要顺手建立 UTF-8 文件编码和中文资源管理约束。

## 目标架构

目标不是“让 Next 忽略更多东西”这么简单，而是把应用分成四层：

```text
UI Layer
  React 组件，只处理交互状态、展示、少量请求编排

Client API Layer
  lib/client/api.ts，只包含浏览器 fetch 包装和类型，不 import mock 大对象

Server Application Layer
  route handlers 调用 services；每个 service 单一职责

Storage / Index Layer
  所有运行时数据写到 Next root 之外；提供缓存、索引、批量写、内容 hash
```

核心约束：

1. Next 项目根目录只放源码、配置、public、轻量文档。
2. 运行时数据不放在项目根里。
3. 自动保存不写 ledger 全快照。
4. 检索不再每次全量扫文件。
5. 首屏不编译 Workbench/WritingDesk 这类非首屏重模块。
6. 类型检查必须先恢复到绿色。

## 阶段 0：止血与可观测性

目标：先让电脑不再被 dev 拖死，并且能证明每一步优化是否有效。

### 0.1 增加安全启动脚本

改 `package.json`：

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:webpack": "next dev --webpack",
    "dev:profile": "next dev --experimental-cpu-prof",
    "typecheck": "tsc -p tsconfig.app.json --noEmit --pretty false",
    "lint": "eslint ."
  }
}
```

临时运行建议：

```powershell
$env:NEXT_TELEMETRY_DISABLED='1'
$env:NODE_OPTIONS='--max-old-space-size=2048'
pnpm dev
```

说明：

- `dev:webpack` 用来判断问题是否 Turbopack 特有。
- `dev:profile` 在复现 CPU 风暴时生成 CPU profile。
- `NODE_OPTIONS` 只是安全阀，不是根治。

### 0.2 写一个本地采样脚本

新增 `scripts/dev-profile.ps1`，做三件事：

1. 启动 `next dev` 到固定端口。
2. 每秒记录 node/next 子进程 CPU、Working Set、Private Memory。
3. 可选访问首页和关键 API，然后自动停止。

输出写到 `plan/profile-YYYYMMDD-HHMMSS.csv`。

验收标准：

- 能稳定采集启动、访问首页、打开工作台、编辑自动保存四个场景。
- 每次优化前后都能用同一脚本比较。

### 0.3 清理开发缓存作为基线

只清理生成物，不动源码和数据：

```powershell
Remove-Item -Recurse -Force .next
pnpm dev
```

如果清理后第一次访问仍爆内存，说明不是历史缓存污染，而是当前架构触发。

## 阶段 1：切断 dev 监听与写入反馈环

目标：运行时文件变化不再刺激 Next dev。

### 1.1 抽象数据根目录

新增 `lib/server/paths.ts`：

```ts
import path from "node:path"

export function getDataRoot() {
  return process.env.LG_DATA_DIR
    ? path.resolve(process.env.LG_DATA_DIR)
    : path.resolve(process.cwd(), "..", ".lg-data")
}

export function getBooksRoot() {
  return path.join(getDataRoot(), "books")
}

export function getIndexRoot() {
  return path.join(getDataRoot(), "index")
}
```

替换以下模块里的硬编码 `path.join(process.cwd(), "data", ...)`：

- `lib/server/book-store.ts`
- `lib/server/chapter-store.ts`
- `lib/server/dirty-index.ts`
- `lib/server/ledger.ts`
- `lib/server/message-store.ts`
- `lib/server/skill-service.ts`
- `lib/server/system-check-service.ts`
- `scripts/seed.ts`

默认数据目录改成：

```text
C:\Users\qdz\Desktop\cli\.lg-data
```

也可以在 `.env` 里显式设置：

```env
LG_DATA_DIR=C:\Users\qdz\Desktop\cli\.lg-data
```

### 1.2 提供迁移脚本

新增 `scripts/migrate-data.ts`：

功能：

1. 如果旧目录 `lg/data` 存在，把它复制到 `../.lg-data`。
2. 如果目标目录已有数据，默认不覆盖。
3. 输出迁移摘要：书籍数量、文件数量、总大小。

命令：

```json
"data:migrate": "tsx scripts/migrate-data.ts"
```

### 1.3 明确 Turbopack root

改 `next.config.mjs`：

```js
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: "tsconfig.next.json",
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
```

依据：Next 官方文档说明 `turbopack.root` 用于设置应用根目录；缩小 root 有助于减少 filesystem watching overhead 和 resolving steps。

### 1.4 调整 tsconfig

新增 `tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "target": "ES2022",
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

改 `tsconfig.json` 为开发/编辑器主配置：

```json
{
  "extends": "./tsconfig.base.json",
  "include": [
    "next-env.d.ts",
    "app/**/*.ts",
    "app/**/*.tsx",
    "components/**/*.ts",
    "components/**/*.tsx",
    "hooks/**/*.ts",
    "hooks/**/*.tsx",
    "lib/**/*.ts",
    "lib/**/*.tsx",
    "scripts/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    ".next",
    "data",
    "../.lg-data"
  ]
}
```

新增 `tsconfig.next.json` 给 Next 构建使用：

```json
{
  "extends": "./tsconfig.json",
  "include": [
    "next-env.d.ts",
    "app/**/*.ts",
    "app/**/*.tsx",
    "components/**/*.ts",
    "components/**/*.tsx",
    "hooks/**/*.ts",
    "hooks/**/*.tsx",
    "lib/**/*.ts",
    "lib/**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    ".next/cache",
    ".next/server",
    ".next/static",
    ".next/dev",
    "data",
    "../.lg-data"
  ]
}
```

关键点：

- 移除 `.next/dev/types/**/*.ts`。
- 不再用根级 `**/*.ts`。
- `ignoreBuildErrors` 改回 `false`。

验收标准：

```powershell
pnpm exec tsc -p tsconfig.json --noEmit --pretty false
pnpm exec tsc -p tsconfig.next.json --noEmit --pretty false
pnpm dev
```

## 阶段 2：修复写放大与数据膨胀

目标：一次编辑最多产生一次必要写入，不再让 ledger 持续复制全文。

### 2.1 引入统一写入服务

新增：

```text
lib/server/storage/file-store.ts
lib/server/storage/change-log.ts
lib/server/storage/dirty-index.ts
```

`file-store.ts` 负责：

- 路径安全校验
- 内容 hash
- 相同内容跳过写入
- 原子写：先写临时文件，再 rename
- 返回 `{ changed, updatedAt, beforeHash, afterHash, bytes }`

伪代码：

```ts
export async function writeTextFile(input) {
  const before = await readIfExists(input.path)
  const beforeHash = hash(before ?? "")
  const afterHash = hash(input.content)

  if (beforeHash === afterHash) {
    return { changed: false, updatedAt: existingMtime, beforeHash, afterHash }
  }

  await atomicWrite(input.path, input.content)
  return { changed: true, updatedAt, beforeHash, afterHash }
}
```

### 2.2 ledger 不再记录完整正文快照

当前 `LedgerEntry` 不应保存完整 `beforeSnapshot` 和 `afterSnapshot`。

改成：

```ts
interface LedgerEntry {
  id: string
  bookId: string
  timestamp: string
  actor: "user" | "agent" | "system"
  action: string
  targetPath: string
  summary: string
  beforeHash?: string
  afterHash?: string
  beforeBytes?: number
  afterBytes?: number
  diffPreview?: string
}
```

只保存小型 `diffPreview`，最大 2KB。

如果将来确实需要版本恢复，再单独设计 snapshot 存储：

```text
.lg-data/books/<bookId>/.history/<hash>.md
```

不要塞进 JSONL。

### 2.3 自动保存和 ledger 解耦

写作台自动保存分两类：

1. 草稿 autosave：高频、低成本，只更新正文和 mtime，不写 ledger。
2. 明确保存/章节切换/AI 应用：低频、有语义，才写 ledger。

前端改法：

- `saveChapter()` body 增加 `source: "autosave" | "manual" | "agent"`。
- autosave debounce 从 2 秒改到 3-5 秒。
- 保存时传 `baseVersion` 或 `contentHash`，避免旧请求覆盖新内容。
- 使用 `AbortController` 取消过期保存请求。

服务端改法：

```ts
if (source === "autosave") {
  await writeTextFile(...)
  await updateBookMtime(...)
  return
}

await writeTextFile(...)
await appendLedgerEntry(...)
await markDirty(...)
```

验收标准：

- 连续输入 60 秒，`ledger.jsonl` 不持续增长。
- 相同内容保存不会改 mtime，不会写 dirty index。
- dev server 不因自动保存反复重新编译。

### 2.4 dirty index 改成增量 KV

当前 `dirty-files.json` 每次 mark 都是读全量、改数组、写全量。

短期可以继续 JSON 文件，但要：

- 内容未变不 mark dirty。
- 同一文件重复 dirty 只更新时间，不扩数组。
- 写入防抖：同一事件循环批量 flush。

中期建议用 SQLite 或 tiny JSON KV：

```text
.lg-data/index/dirty-files.sqlite
```

当前项目规模不大，第一阶段先做 JSON 防抖即可。

## 阶段 3：建立索引，停止全量扫描

目标：查询、工作台、系统检查都读索引，不每次扫文件树。

### 3.1 书籍文件索引

新增：

```text
lib/server/index/book-index.ts
```

索引结构：

```ts
interface BookFileIndexEntry {
  bookId: string
  path: string
  name: string
  ext: string
  category: string
  updatedAt: string
  size: number
  hash: string
  title?: string
  excerpt?: string
  keywords?: string[]
}
```

触发时机：

- seed/migrate 后全量 build 一次。
- `writeTextFile()` 成功写入后只更新单文件索引。
- 删除/重命名时只更新相关 path。

### 3.2 Workbench tree 读索引

`GET /api/books/[bookId]/tree` 当前递归扫目录。

改为：

```text
loadBookIndex(bookId) -> group by category/path -> tree
```

只有当索引不存在或 hash 不一致时才 fallback 到全量重建。

### 3.3 retrieval 读索引和候选文件

`retrieveContext()` 改成两段：

1. 先用 index 的 path/name/title/keywords/excerpt 打分，选出最多 10 个候选。
2. 只读取候选文件正文生成最终 excerpt。

不要在每次请求里对所有文件做 `readBookFile()`。

验收标准：

- 1000 个 markdown 文件时，一次 retrieve 不读取超过 10 个正文文件。
- `GET /tree` 不再随文件数量线性增长到不可用。

### 3.4 system check 限制读取窗口

系统检查当前会按类型读取多个目录和章节。改法：

- 默认读取最近 N 个章节摘要，而不是全部。
- quality 检查读取最近 3 个正文保持可配置。
- UI 上显示“本次检查读取了哪些文件”。
- 对 LLM prompt 做 token 预算，不允许把巨大文件拼进去。

## 阶段 4：拆前端首屏与 API 聚合

目标：访问首页时只编译首屏需要的代码。

### 4.1 `app/page.tsx` 回到 Server Component

当前 `app/page.tsx` 是 `"use client"`。改成：

```tsx
import { LgShell } from "@/components/lg/lg-shell"

export default function Page() {
  return <LgShell />
}
```

新增 `components/lg/lg-shell.tsx` 作为 client component，承接当前 page 的状态逻辑。

### 4.2 动态加载非首屏重模块

Workbench 只在用户打开时加载：

```tsx
const Workbench = dynamic(
  () => import("@/components/lg/workbench").then((m) => m.Workbench),
  { ssr: false }
)
```

WritingDesk 只在写作模式加载。

RightSidebar 可以继续首屏加载，但后续可按 action panel 拆。

### 4.3 客户端 API 不再 import mock 大对象

拆分：

```text
lib/client/api.ts
lib/client/fallback-data.ts
lib/server/*
```

`lib/client/api.ts` 只保留 fetch 包装和类型引用：

```ts
import type { Book, Chapter } from "@/lib/types"
```

mock fallback 移到：

- 开发专用 API fallback，或
- `lib/client/fallback-data.ts` 动态 import。

不要让真实首页默认带上所有 mock 数据。

### 4.4 聚合首屏 API

当前切换书籍后会并发打：

- `GET /chapters`
- `GET /messages`
- `GET /action-plan`
- `GET /setting-cards`

新增：

```text
GET /api/books/[bookId]/workspace
```

返回：

```ts
{
  chapters,
  messagesPreview,
  actionPlan,
  settingCards
}
```

首屏只打一到两个请求，减少 dev route 编译和文件 IO。

## 阶段 5：拆服务端大模块

目标：降低热更新粒度、减少类型漂移。

### 5.1 拆 `lib/server/action-plan.ts`

目标结构：

```text
lib/server/action-plan/
  types.ts
  ids.ts
  parser.ts
  llm-adapter.ts
  builder.ts
  store.ts
  executor/
    index.ts
    character.ts
    relationship.ts
    world.ts
    chapter-check.ts
    system-check.ts
```

原则：

- parser 只把用户文本变成 `ParsedIntent[]`。
- builder 只把 intent 变成 `ActionNode[]`。
- executor 只执行已确认的 leaf。
- store 只读写 pending plan。

### 5.2 删除 messages route 里的重复 regex

`app/api/books/[bookId]/messages/route.ts` fallback 不应再内联 150+ 行正则。

改成：

```ts
import { parseUserIntents } from "@/lib/server/action-plan/parser"
import { buildActionPlan } from "@/lib/server/action-plan/builder"
```

这样 parser 类型只定义一处，`ParsedIntent` 不会再和 route 推断类型互相打架。

### 5.3 修复当前类型错误

具体修复：

1. `IntentBrief.contextPaths` 如果业务上可为空，类型改为可选：

   ```ts
   contextPaths?: string[]
   ```

   或所有 brief 构造都补：

   ```ts
   brief: { understood: [x], contextPaths: [] }
   ```

2. `ParsedIntent` 增加 `event?: string`，或把 `timeline_event_add` 的字段统一为 `content`。

3. route fallback 的 `checkType` 用 `as const` 或显式 `SystemCheckType`。

4. 修 `system-check-service.ts` 的 always truthy：

   当前类似：

   ```ts
   ${"{target}" ? "...": ""}
   ```

   应改成运行时拼接，不在常量 prompt 里判断字符串字面量。

验收标准：

```powershell
pnpm exec tsc -p tsconfig.json --noEmit --pretty false
pnpm exec eslint . --no-error-on-unmatched-pattern
pnpm build
```

## 阶段 6：编码与文本资源治理

目标：让中文 prompt、正则、路径都可维护。

### 6.1 全项目统一 UTF-8

新增 `.editorconfig`：

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

### 6.2 把大段中文 prompt 移出 TS 逻辑

新增：

```text
lib/server/prompts/
  conversation-system.zh-CN.md
  system-check-foreshadowing.zh-CN.md
  system-check-timeline.zh-CN.md
  system-check-quality.zh-CN.md
```

TS 里只读 prompt 文件，并做变量替换。

收益：

- 降低 TS 文件体积。
- 避免正则和 prompt 混在一起。
- 方便检查乱码。

### 6.3 正则意图识别加测试

新增测试样例：

```text
tests/intent-parser.test.ts
```

至少覆盖：

- 修改人物性别
- 修改人物关系
- 新建人物
- 更新世界观
- 记录伏笔
- 回收伏笔
- 时间线事件
- 系统一致性检查

可以先用 Node 内置 test runner，不必引入大测试框架。

## 阶段 7：可选中期升级

如果真实写作数据会增长到数千文件或几十 MB，建议进入中期升级：

1. 用 SQLite 存 messages、ledger、dirty index、file index。
2. Markdown 正文仍保留文件系统，便于人工编辑和备份。
3. 后台索引任务使用单独进程或 worker，避免堵塞 Next route。
4. 检索升级为 SQLite FTS5 或轻量向量索引。

目标结构：

```text
.lg-data/
  books/
    <bookId>/
      files/
      .history/
  lg.sqlite
```

## 推荐实施顺序

第一批必须做，预计 0.5-1 天：

1. 增加 profile 脚本和安全 dev 脚本。
2. 拆出 `paths.ts`，把 `data/` 迁到 Next root 外。
3. 调整 `next.config.mjs`、`tsconfig.json`、`tsconfig.next.json`。
4. 修掉当前 `tsc` 错误，关闭 `ignoreBuildErrors`。

第二批解决写放大，预计 1-2 天：

1. 写统一 `file-store`。
2. 自动保存加 hash skip、AbortController、source 标记。
3. ledger 去掉全文快照。
4. dirty index 防抖。

第三批解决规模化，预计 2-4 天：

1. 建 book file index。
2. Workbench tree 改读索引。
3. retrieval 改两段候选读取。
4. system check 加读取窗口和 token budget。

第四批整理架构，预计 2-3 天：

1. `app/page.tsx` server 化。
2. 动态加载 Workbench/WritingDesk。
3. `lib/client/api.ts` 拆 mock。
4. 拆 `action-plan.ts`。
5. 把 prompt 移到 markdown 文件。

## 每阶段验收指标

### 启动

```powershell
pnpm dev
```

验收：

- 未访问页面时，Node 总 Working Set 稳定低于 500MB。
- 空闲 30 秒 CPU 不应持续高于 10%。

### 首次访问首页

验收：

- 首次编译完成后 CPU 能回落。
- Node 总 Working Set 目标低于 800MB。
- 不出现页面反复 refresh/recompile。

### 写作台自动保存

操作：

1. 打开某章节。
2. 连续输入 60 秒。
3. 停止输入 30 秒。

验收：

- 停止输入后 CPU 回落。
- `ledger.jsonl` 不随 autosave 持续增长。
- `.next/` 不因 autosave 高频变化持续膨胀。
- Network 中保存请求不会并发堆积。

### 工作台

操作：

1. 打开 Workbench。
2. 切换文件。
3. 保存文件。

验收：

- `GET /tree` 不做全量 fs walk，或只在 index miss 时做。
- 保存同内容不写文件，不更新 ledger。

### 检索/聊天

操作：

1. 发送查询类消息。
2. 发送修改类消息。

验收：

- retrieve 读取正文文件数有上限。
- 消息 append 不触发 dev 反复编译。
- route 类型全绿。

## 回滚方案

每个阶段独立提交。

推荐提交粒度：

1. `chore: add dev profiling and typecheck configs`
2. `refactor: move runtime data outside next root`
3. `fix: restore strict typecheck`
4. `refactor: reduce autosave write amplification`
5. `feat: add book file index`
6. `refactor: split client shell and dynamic workbench`
7. `refactor: split action plan services`

如果某阶段引入问题：

- 只 revert 当前阶段提交。
- 数据迁移保留源目录备份。
- `LG_DATA_DIR` 可临时指回旧 `data`，但只用于回滚验证，不建议长期使用。

## 不建议做的事

1. 不建议单纯把 `NODE_OPTIONS` 调到很大。这只会让爆内存更晚发生。
2. 不建议继续在项目根写运行时数据。
3. 不建议让 autosave 写完整 ledger 快照。
4. 不建议继续依赖 `ignoreBuildErrors: true`。
5. 不建议在 route 里继续堆大型正则和业务执行逻辑。
6. 不建议先上数据库替换所有文件。当前更应该先解决监听反馈、写放大和索引。

## 参考资料

- Next.js Turbopack `root` 配置：`https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack`
- Next.js TypeScript `ignoreBuildErrors` 和 `tsconfigPath`：`https://nextjs.org/docs/pages/api-reference/config/next-config-js/typescript`
- Next.js Output File Tracing：`https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output`
