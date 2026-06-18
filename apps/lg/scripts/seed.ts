import fs from "fs/promises"
import path from "path"
import { getBooksRoot } from "@/lib/server/paths"
const BOOK_ID = "demo-guixu"

const now = new Date().toISOString()

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function write(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, "utf-8")
}

async function main() {
  const bookDir = path.join(getBooksRoot(), BOOK_ID)

  // book.json
  await write(path.join(bookDir, "book.json"), JSON.stringify({
    id: BOOK_ID,
    title: "归墟之外",
    createdAt: "2026-05-24T10:00:00.000Z",
    updatedAt: now,
  }, null, 2) + "\n")

  // 剧情设计指南.md
  await write(path.join(bookDir, "剧情设计指南.md"), `# 剧情设计指南

## 一句话故事

这是一个关于游历武者林晓的人,为了查清师门旧案,最终揭开归墟之外真相的故事。

## 主人公起点

林晓是前禁军斥候,寡言、谨慎,背负旧案与身份阴影。她的起点不是平静生活,而是已经被卷入追查和逃避之间。

## 任务与动机

任务：查清师门旧案与归墟异动之间的关系。

动机：旧案影响她的身份、师承和未来选择,如果不查清,她无法摆脱被利用或被清算的命运。

## 阻力

- 陈磊代表的敌对势力；
- 秦老掌握但不完全说出的旧情报；
- 归墟相关的未知风险；
- 林晓自身不轻信他人的性格缺陷。

## 关卡

1. 取得秦老信任,但不能暴露全部目的；
2. 接近陈磊,同时避免被他反向试探；
3. 找到归墟线索,却发现线索会牵连旧友；
4. 在真相和自保之间做选择。

## 悬念

- 归墟之外到底是什么？
- 秦老隐瞒了什么？
- 陈磊是真的敌人,还是另一条线索？
`)

  // 关系图谱.json
  await write(path.join(bookDir, "关系图谱.json"), JSON.stringify({
    linxiao_chenlei: "hostile",
    linxiao_shenfurong: "ally",
    linxiao_qinlao: "master",
    chenlei_qinlao: "master",
  }, null, 2) + "\n")

  // 人物设定
  await write(path.join(bookDir, "人物设定", "林晓.md"), `# 林晓

**性别**　女
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
`)

  await write(path.join(bookDir, "人物设定", "陈磊.md"), `# 陈磊

**性别**　男
**年龄**　27 岁
**身份**　归墟剑派内门弟子

---

## 人物小传

与林晓同出秦老门下,后投归墟剑派。外表温文,内心功利。对林晓既有旧情又有忌惮。

## 关联人物

- 林晓 — 敌对
- 秦老 — 师父
`)

  await write(path.join(bookDir, "人物设定", "沈芙蓉.md"), `# 沈芙蓉

**性别**　女
**年龄**　22 岁
**身份**　南海商人之女 / 情报掮客

---

## 人物小传

表面上是往来南北的茶商,实际经营情报网络。与林晓在一次护镖中结识,成为盟友。性格圆滑但重义。

## 关联人物

- 林晓 — 盟友
`)

  // 世界观
  await write(path.join(bookDir, "世界观", "规则体系.md"), `# 规则体系

## 剑气循环

气随意转,意动剑发。归墟剑派内功心法核心。

## 禁军制度

禁军斥候三年一换,任期满后可申请退役。林晓因故提前出走。
`)

  await write(path.join(bookDir, "世界观", "地图.md"), `# 世界地图

- **北境**：雪原与残破长城,边境小镇所在地
- **中州**：王朝腹地,长安所在
- **南海**：三十六岛,海外仙山传说
- **归墟**：传说中世界尽头的深渊,亦是剑派祖地
`)

  // 章节大纲
  await write(path.join(bookDir, "章节大纲", "第一章.md"), `# 第一章 · 归墟初见

林晓于雪夜抵达归墟外围,在石阶上遇到值守的陈磊。两人多年未见,气氛冷峻。

## 关键场景

- 雪夜石阶对峙
- 师门旧事暗示
- 归墟深渊初现

## 字数

约 3000 字
`)

  await write(path.join(bookDir, "章节大纲", "第二章.md"), `# 第二章 · 旧账新算

陈磊邀林晓入派叙旧,言语间试探来意。林晓察觉派中气氛不对。

## 关键场景

- 派内宴席暗流
- 沈芙蓉来信
- 深夜密谈

## 字数

约 3000 字
`)

  // 章节正文
  await write(path.join(bookDir, "章节正文", "第一章 · 归墟初见.md"), `# 第一章 · 归墟初见

雪落在石阶上,没有声音。

林晓把斗笠压低一寸,抬头望向山门。匾额上的字被风蚀得只剩轮廓,隐约能辨出"归墟"二字。

"来者何人。"

声音从左侧传来。一个青衫青年靠在石柱上,手里握着一柄未出鞘的剑。

林晓没有回答。她认出了那个人。

"林晓。"陈磊站起来,嘴角挂着那种她熟悉的笑,"三年了。"

"三年零四个月。"林晓说。

空气冷得发硬。两人之间隔着七级石阶,和一段谁也不愿先开口的旧事。

"师父呢。"林晓问。

"死了。"陈磊把剑换到左手,"去年冬天。你没来。"

林晓沉默了很久。雪落在她肩上,没有化。

"我来查一件事。"她说。

陈磊侧过身,让出半级台阶。山门内的灯火忽明忽暗,像是有人在远处拨弄灯芯。

"进来吧。"他说,"外面冷。"
`)

  await write(path.join(bookDir, "章节正文", "第二章 · 旧账新算.md"), `# 第二章 · 旧账新算

宴席摆在内堂。

桌上只有两副碗筷,一壶冷酒。陈磊坐在主位,给林晓倒了一杯。

"派里的规矩,来了客人要喝三碗。"

林晓没动。她扫了一眼堂内的陈设——柱子上有新钉的铁环,墙角堆着没来得及搬走的兵器架。

"这里打过仗。"她说。

陈磊的笑容没变。"师妹还是这么眼尖。"

"别叫我师妹。"

"好。林晓。"他放下酒壶,"你来查什么。"

"禁军的事。"

堂外忽然起了风,把窗纸吹得猎猎作响。陈磊站起来去关窗,背对着她。

"禁军的事,你该去长安查。"

"长安的人说,线索在归墟。"

陈磊关上窗,转过身。灯火映在他脸上,半明半暗。

"那你先住下。"他说,"明天我带你见一个人。"

林晓端起酒碗,抿了一口。酒是苦的。

她没有问见谁。有些答案,不能问得太急。
`)

  // ledger.jsonl
  await write(path.join(bookDir, "ledger.jsonl"), [
    JSON.stringify({ id: "l1", ts: "2026-05-24T11:03:00Z", actor: "user", action: "update", targetPath: "人物设定/林晓.md", summary: "将林晓性别从男改为女" }),
    JSON.stringify({ id: "l2", ts: "2026-05-24T11:03:00Z", actor: "user", action: "update", targetPath: "关系图谱.json", summary: "将林晓与陈磊关系从 ally 改为 hostile" }),
  ].join("\n") + "\n")

  // messages.jsonl
  await write(path.join(bookDir, "messages.jsonl"), [
    JSON.stringify({
      id: "m1",
      role: "user",
      content: "帮我看看第一章的开头写得怎么样",
      createdAt: "11:00",
    }),
    JSON.stringify({
      id: "m2",
      role: "assistant",
      content: "主人,第一章开头的雪夜氛围营造得很好,短句节奏干净利落。林晓与陈磊的重逢对话克制有力,留白恰到好处。建议注意\"三年零四个月\"这个细节——如果后文要呼应,需要在其他地方埋下伏笔。",
      createdAt: "11:00",
      brief: {
        understood: ["分析第一章开头质量"],
        contextPaths: ["章节正文/第一章 · 归墟初见.md", "人物设定/林晓.md", "人物设定/陈磊.md"],
      },
    }),
  ].join("\n") + "\n")

  console.log(`Seed data written to ${bookDir}`)
  console.log("")
  console.log("Files created:")
  console.log("  book.json")
  console.log("  剧情设计指南.md（剧情设计指南）")
  console.log("  关系图谱.json")
  console.log("  人物设定/林晓.md")
  console.log("  人物设定/陈磊.md")
  console.log("  人物设定/沈芙蓉.md")
  console.log("  世界观/规则体系.md")
  console.log("  世界观/地图.md")
  console.log("  章节大纲/第一章.md")
  console.log("  章节大纲/第二章.md")
  console.log("  章节正文/第一章 · 归墟初见.md")
  console.log("  章节正文/第二章 · 旧账新算.md")
  console.log("  ledger.jsonl")
  console.log("  messages.jsonl")
}

main().catch((e) => {
  console.error("Seed failed:", e)
  process.exit(1)
})
