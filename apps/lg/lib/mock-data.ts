// 模拟数据 + 类型 - 后端接入处统一在 lib/api.ts
import type {
  AgentEvent,
  Book as ServerBook,
  Chapter,
  OutlineFile,
  IntentBrief,
  Message,
  SettingCard,
  Thread,
  Turn,
} from "@/lib/types"

export type { AgentEvent, Chapter, IntentBrief, Message, OutlineFile, SettingCard, Thread, Turn }

export type Book = Pick<ServerBook, "id" | "title" | "updatedAt"> & {
  cover?: string
}

export const mockBooks: Book[] = [
  { id: "b1", title: "归墟之外", updatedAt: "2h" },
  { id: "b2", title: "雾港旧事", updatedAt: "昨日" },
  { id: "b3", title: "白塔以南", updatedAt: "3d" },
]

export const mockChapters: Chapter[] = [
  {
    id: "c1",
    bookId: "b1",
    title: "第一章 · 归墟初见",
    index: 1,
    wordCount: 3247,
    status: "done",
    path: "章节正文/第一章 · 归墟初见.md",
    updatedAt: "2026-05-29T00:00:00.000Z",
  },
  {
    id: "c2",
    bookId: "b1",
    title: "第二章 · 林晓出山",
    index: 2,
    wordCount: 2847,
    status: "writing",
    path: "章节正文/第二章 · 林晓出山.md",
    updatedAt: "2026-05-29T00:00:00.000Z",
  },
  {
    id: "c3",
    bookId: "b1",
    title: "第三章 · 陈磊的剑",
    index: 3,
    wordCount: 1980,
    status: "draft",
    path: "章节正文/第三章 · 陈磊的剑.md",
    updatedAt: "2026-05-29T00:00:00.000Z",
  },
  {
    id: "c4",
    bookId: "b1",
    title: "第四章 · 雪夜对峙",
    index: 4,
    wordCount: 0,
    status: "draft",
    path: "章节正文/第四章 · 雪夜对峙.md",
    updatedAt: "2026-05-29T00:00:00.000Z",
  },
  {
    id: "c5",
    bookId: "b1",
    title: "第五章 · 师门旧事",
    index: 5,
    wordCount: 0,
    status: "draft",
    path: "章节正文/第五章 · 师门旧事.md",
    updatedAt: "2026-05-29T00:00:00.000Z",
  },
]

export const mockMessages: Message[] = [
  {
    id: "m1",
    threadId: "thread-mock",
    turnId: "turn-mock-1",
    role: "user",
    content: "把林晓改成女的,顺便把她和陈磊的关系变成敌对,第五章好像也提到他们了",
    version: 1,
    createdAt: "14:32",
  },
  {
    id: "m2",
    threadId: "thread-mock",
    turnId: "turn-mock-1",
    role: "assistant",
    thought: "拆分了三个意图,正在多路召回相关设定文件与章节",
    thoughtSeconds: 3,
    content: "我会先读取相关设定和章节。真实服务可直接写入项目文件，并在右侧最近改动和 Ledger 里留下记录。",
    version: 1,
    createdAt: "14:32",
    events: [
      {
        id: "event-mock-1",
        turnId: "turn-mock-1",
        type: "observe",
        text: "识别到人物设定和关系设定修改。",
        createdAt: "14:32",
      },
      {
        id: "event-mock-2",
        turnId: "turn-mock-1",
        type: "retrieve",
        text: "检索到 4 个相关上下文。",
        paths: ["人物设定/林晓.md", "关系图谱.json", "章节/第二章.txt", "章节/第五章.txt"],
        createdAt: "14:32",
      },
    ],
    brief: {
      understood: ["将林晓性别改为女", "把林晓与陈磊关系调整为敌对", "同步检查相关章节描写"],
      contextPaths: ["人物设定/林晓.md", "关系图谱.json", "章节/第二章.txt", "章节/第五章.txt"],
      missing: ["第七章中再次出现林晓时是否同步修改？"],
    },
    references: [
      { type: "character", name: "林晓", path: "人物设定/林晓.md" },
      { type: "character", name: "陈磊", path: "人物设定/陈磊.md" },
      { type: "chapter", name: "第五章", path: "章节/第五章.txt" },
    ],
  },
]

export const mockThreads: Thread[] = [
  {
    id: "thread-mock",
    bookId: "b1",
    title: "默认任务线程",
    status: "active",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
  },
]

export const mockTurns: Turn[] = [
  {
    id: "turn-mock-1",
    threadId: "thread-mock",
    userMessageId: "m1",
    assistantMessageId: "m2",
    status: "done",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
  },
]

// 工作台文件树
export type WorkbenchFile = {
  id: string
  name: string
  path: string
  modified?: boolean
}
export type WorkbenchGroup = {
  id: string
  label: string
  files: WorkbenchFile[]
}

export const mockWorkbenchTree: WorkbenchGroup[] = [
  {
    id: "g1",
    label: "人物设定",
    files: [
      { id: "f1", name: "林晓.md", path: "人物设定/林晓.md", modified: true },
      { id: "f2", name: "陈磊.md", path: "人物设定/陈磊.md" },
      { id: "f3", name: "沈芙蓉.md", path: "人物设定/沈芙蓉.md" },
    ],
  },
  {
    id: "g2",
    label: "世界观",
    files: [
      { id: "f4", name: "地图.md", path: "世界观/地图.md" },
      { id: "f5", name: "规则体系.md", path: "世界观/规则体系.md" },
    ],
  },
  {
    id: "g3",
    label: "章节大纲",
    files: [
      { id: "f6", name: "第一章.md", path: "章节大纲/第一章.md" },
      { id: "f7", name: "第二章.md", path: "章节大纲/第二章.md" },
    ],
  },
  {
    id: "g4",
    label: "系统文件",
    files: [
      { id: "f8", name: "关系图谱.json", path: "data/关系图谱.json" },
      { id: "f10", name: "创作指南.md", path: "data/创作指南.md" },
    ],
  },
]

export const mockFileContent: Record<string, string> = {
  "人物设定/林晓.md": `# 林晓

**性别**　男（申请修改为女）  
**年龄**　24 岁  
**身份**　游历武者 / 前禁军斥候  
**登场章节**　第一章 — 第七章

---

## 人物小传

出身边境小镇,幼年随父习武。禁军任期三年后因故出走,现以护镖为生。性情冷峻,寡言少语,但对弱者心存悲悯。与陈磊有旧怨,关系微妙。

## 核心冲突

追查禁军内乱真相,与家族使命和个人情义之间持续撕裂。

## 关联人物

- 陈磊 — 敌对
- 沈芙蓉 — 盟友
- 秦老 — 师父
- 林父 — 已故

## 出现章节

第一章 · 第三章 · 第五章 · 第七章
`,
  "人物设定/陈磊.md": `# 陈磊\n\n归墟剑派大师兄,沉稳寡言,守护山门多年。\n`,
  "人物设定/沈芙蓉.md": `# 沈芙蓉\n\n江南书香门第,精于音律。\n`,
  "世界观/地图.md": `# 世界地图\n\n- 北境:雪原与残破长城\n- 中州:王朝腹地\n- 南海:三十六岛\n`,
  "世界观/规则体系.md": `# 规则体系\n\n剑气循环:气随意转,意动剑发。\n`,
  "章节大纲/第一章.md": `# 第一章 · 归墟初见\n\n林晓于雪夜抵达归墟外围……\n`,
  "章节大纲/第二章.md": `# 第二章 · 林晓出山\n\n他/她背剑下山,目标长安。\n`,
  "data/关系图谱.json": `{\n  "linxiao_chenlei": "hostile",\n  "linxiao_shenfurong": "ally"\n}\n`,
  "data/ledger.jsonl": `{"event":"林晓性别改为女","ts":"2026-05-24T11:03:00"}\n`,
  "data/创作指南.md": `# 创作指南\n\n保持冷峻、克制、近物质的语感。\n`,
}

export const mockSettingCards: SettingCard[] = [
  {
    id: "s1",
    category: "character",
    name: "林晓",
    summary: "归墟剑派少年弟子,天资聪颖,与陈磊师出同门。",
    meta: { 性别: "男", 身份: "武者", 关系: "陈磊（友）" },
  },
  {
    id: "s2",
    category: "character",
    name: "陈磊",
    summary: "归墟剑派大师兄,沉稳寡言,守护山门多年。",
    meta: { 性别: "男", 身份: "大师兄" },
  },
  {
    id: "s3",
    category: "location",
    name: "归墟",
    summary: "传说中世界尽头的深渊,亦是剑派祖地。",
  },
  {
    id: "s4",
    category: "rule",
    name: "剑气循环",
    summary: "归墟剑派内功心法,讲究气随意转、意动剑发。",
  },
]
