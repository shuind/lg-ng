"use client"

import { useEffect, useState } from "react"
import { PenLine, Plus, Sparkles, Trash2, WandSparkles } from "lucide-react"
import type { SkillResourceKind, SkillTextResource, Skill } from "@/lib/types"
import { createSkill, draftSkill, getSkillDraft, getStyleGuideSkill, listSkills, refreshStyleGuideSummary, updateSkill } from "@/lib/api"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { LoadingPane } from "./shared"

function skillDisplayName(skill: Skill): string {
  return skill.name || (skill.type === "style_guide" ? "创作指南" : skill.id)
}

function skillKindLabel(skill: Skill): string {
  if (skill.source === "style_guide" || skill.type === "style_guide") return "创作指南"
  if (skill.source === "claude_skill") return "本地 Skill"
  return skill.type
}

const SKILL_RESOURCE_OPTIONS: Array<{ id: SkillResourceKind; label: string; description: string }> = [
  { id: "references", label: "references", description: "放长规则、参考资料、设定说明。" },
  { id: "scripts", label: "scripts", description: "放可重复使用的文本处理脚本或辅助代码。" },
  { id: "assets", label: "assets", description: "放可复用的文本模板、素材说明。" },
]

function normalizeSkillInputName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
}

function skillDirectoryName(skill: Skill): string | null {
  const normalized = skill.sourceFile.replace(/\\/g, "/")
  const match = normalized.match(/^\.claude\/skills\/([^/]+)\/SKILL\.md$/i)
  return match?.[1] ?? null
}

function syncSkillMdName(content: string, nextName: string, previousName: string): string {
  const lines = content.split(/\r?\n/)
  if (lines[0] !== "---") return content

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") return content
    const match = lines[index].match(/^name:\s*(.*)$/)
    if (!match) continue

    const currentName = normalizeSkillInputName(match[1].replace(/^["']|["']$/g, ""))
    if (currentName && previousName && currentName !== previousName) return content
    lines[index] = `name: ${nextName}`
    return lines.join("\n")
  }

  return content
}

function createDefaultSkillMd(name: string): string {
  return [
    "---",
    `name: ${name}`,
    'description: "当前书籍项目内可复用的小说写作流程。"',
    'when_to_use: "当用户明确需要这套写作流程时使用。"',
    'argument-hint: "[范围或参考材料]"',
    "---",
    "",
    `# ${name}`,
    "",
    "这个 Skill 用来沉淀一套可复用的小说写作流程。",
    "",
    "## 工作流程",
    "",
    "1. 先确认用户这次想要的具体产出。",
    "2. 判断是否需要读取相关书籍文件，不要凭空断言。",
    "3. 结合项目设定、写作约束和必要参考资料处理。",
    "4. 输出结果时保持简洁，需要时给出相关文件路径。",
    "",
  ].join("\n")
}

export function SkillPane({ bookId, onOpenFile }: { bookId: string; onOpenFile: (path: string) => void }) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [summary, setSummary] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingSkillName, setEditingSkillName] = useState<string | null>(null)
  const [skillName, setSkillName] = useState("novel-skill")
  const [goal, setGoal] = useState("")
  const [triggers, setTriggers] = useState("")
  const [examples, setExamples] = useState("")
  const [resourceKinds, setResourceKinds] = useState<SkillResourceKind[]>(["references", "scripts", "assets"])
  const [skillMd, setSkillMd] = useState(() => createDefaultSkillMd("novel-skill"))
  const [resources, setResources] = useState<SkillTextResource[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [createError, setCreateError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [savingSkill, setSavingSkill] = useState(false)
  const [loadingSkillDraft, setLoadingSkillDraft] = useState(false)
  const [skillMdEdited, setSkillMdEdited] = useState(false)
  const styleSkill = skills.find((skill) => skill.type === "style_guide" || skill.source === "style_guide") ?? null
  const isEditingSkill = editingSkillName !== null

  async function loadSkillData(showLoading = true) {
    if (showLoading) setLoading(true)
    try {
      const [skillList, style] = await Promise.all([listSkills(bookId), getStyleGuideSkill(bookId)])
      setSkills(skillList.some((skill) => skill.id === style.skill.id) ? skillList : [style.skill, ...skillList])
      setSummary(style.summary)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    loadSkillData()
  }, [bookId])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const { skill: s, summary: sm } = await refreshStyleGuideSummary(bookId)
      setSkills((current) =>
        current.some((skill) => skill.id === s.id)
          ? current.map((skill) => (skill.id === s.id ? s : skill))
          : [s, ...current],
      )
      setSummary(sm)
    } finally {
      setRefreshing(false)
    }
  }

  function handleSkillNameChange(value: string) {
    const previousName = normalizeSkillInputName(skillName) || editingSkillName || "novel-skill"
    const nextName = normalizeSkillInputName(value) || "novel-skill"
    setSkillName(value)
    if (editingSkillName) {
      setSkillMd((current) => syncSkillMdName(current, nextName, previousName))
      return
    }
    if (!skillMdEdited) {
      setSkillMd(createDefaultSkillMd(nextName))
    }
  }

  function openCreateSkillDialog() {
    setEditingSkillName(null)
    setSkillName("novel-skill")
    setGoal("")
    setTriggers("")
    setExamples("")
    setResourceKinds(["references", "scripts", "assets"])
    setSkillMd(createDefaultSkillMd("novel-skill"))
    setResources([])
    setWarnings([])
    setCreateError("")
    setSkillMdEdited(false)
    setCreateOpen(true)
  }

  async function openEditSkillDialog(skill: Skill) {
    const directoryName = skillDirectoryName(skill)
    if (!directoryName) return

    setEditingSkillName(directoryName)
    setSkillName(directoryName)
    setGoal("")
    setTriggers("")
    setExamples("")
    setResourceKinds(["references", "scripts", "assets"])
    setSkillMd("")
    setResources([])
    setWarnings([])
    setCreateError("")
    setSkillMdEdited(true)
    setCreateOpen(true)
    setLoadingSkillDraft(true)
    try {
      const draft = await getSkillDraft(bookId, directoryName)
      setSkillName(draft.name)
      setSkillMd(draft.skillMd)
      setResources(draft.resources)
      setWarnings(draft.warnings)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "读取 Skill 失败。")
    } finally {
      setLoadingSkillDraft(false)
    }
  }

  function handleToggleResourceKind(kind: SkillResourceKind, checked: boolean) {
    setResourceKinds((current) =>
      checked ? Array.from(new Set([...current, kind])) : current.filter((item) => item !== kind),
    )
  }

  async function handleGenerateDraft() {
    setGenerating(true)
    setCreateError("")
    try {
      const draft = await draftSkill(bookId, {
        nameHint: skillName,
        goal,
        triggers,
        examples,
        resourceKinds,
      })
      setSkillName(draft.name)
      setSkillMd(draft.skillMd)
      setResources(draft.resources)
      setWarnings(draft.warnings)
      setSkillMdEdited(false)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "生成草稿失败。")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveSkill() {
    setSavingSkill(true)
    setCreateError("")
    try {
      const input = {
        name: normalizeSkillInputName(skillName),
        skillMd,
        resources,
      }
      const skill = editingSkillName
        ? await updateSkill(bookId, { ...input, originalName: editingSkillName })
        : await createSkill(bookId, input)
      await loadSkillData(false)
      setCreateOpen(false)
      setEditingSkillName(null)
      onOpenFile(skill.sourceFile)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "保存 Skill 失败。")
    } finally {
      setSavingSkill(false)
    }
  }

  function handleAddResource(kind: SkillResourceKind = "references") {
    setResources((current) => [
      ...current,
      {
        path: `${kind}/notes-${current.length + 1}.md`,
        content: "# 说明\n\n",
      },
    ])
  }

  function handleUpdateResource(index: number, patch: Partial<SkillTextResource>) {
    setResources((current) =>
      current.map((resource, currentIndex) =>
        currentIndex === index ? { ...resource, ...patch } : resource,
      ),
    )
  }

  function handleRemoveResource(index: number) {
    setResources((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  if (loading) return <LoadingPane />

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-10 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-serif text-[16px] text-foreground">Skill</div>
            <div className="mt-1 text-[12px] text-muted-foreground">可复用写作能力与上下文压缩层</div>
          </div>
          <span className="text-[11px] text-muted-foreground">{skills.length} 个可用</span>
        </div>

        <button
          onClick={openCreateSkillDialog}
          className="mb-4 flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90"
        >
          <Plus className="h-3 w-3" />
          新建 Skill
        </button>

        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open)
            if (!open) setEditingSkillName(null)
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{isEditingSkill ? "编辑项目 Skill" : "新建项目 Skill"}</DialogTitle>
              <DialogDescription>
                {isEditingSkill
                  ? "编辑当前书籍里的 Skill。要改短名时，目录名和 SKILL.md 开头的 name 需要一致。"
                  : "在当前书籍的 .claude/skills 下创建 Skill。可以先生成草稿，也可以直接粘贴完整 SKILL.md。"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-foreground">Skill 短名</label>
                  <Input
                    value={skillName}
                    onChange={(event) => handleSkillNameChange(event.target.value)}
                    onBlur={() => setSkillName((current) => normalizeSkillInputName(current) || "novel-skill")}
                    placeholder="novel-review"
                    className="font-mono text-[12px]"
                  />
                  <div className="text-[11px] text-muted-foreground">
                    只能用小写英文字母、数字和连字符。保存后会成为 .claude/skills/&lt;name&gt;。
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-foreground">用途</label>
                  <Textarea
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="这套 Skill 要沉淀哪一种可复用的写作流程？"
                    className="min-h-20 text-[12px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-foreground">什么时候用</label>
                  <Textarea
                    value={triggers}
                    onChange={(event) => setTriggers(event.target.value)}
                    placeholder="用户提出什么需求时，应该使用这个 Skill？"
                    className="min-h-20 text-[12px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-foreground">例子</label>
                  <Textarea
                    value={examples}
                    onChange={(event) => setExamples(event.target.value)}
                    placeholder="可以写几个示例需求，或期望输出长什么样。"
                    className="min-h-20 text-[12px]"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="text-[12px] font-medium text-foreground">文本资源目录</div>
                  {SKILL_RESOURCE_OPTIONS.map((option) => (
                    <label key={option.id} className="flex items-start gap-2 rounded-md px-1 py-1">
                      <Checkbox
                        checked={resourceKinds.includes(option.id)}
                        onCheckedChange={(checked) => handleToggleResourceKind(option.id, checked === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-[12px] text-foreground">{option.label}</span>
                        <span className="block text-[11px] leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleGenerateDraft}
                  disabled={generating || loadingSkillDraft}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2 text-[12px] font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                  {generating ? "生成中..." : "生成草稿"}
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-foreground">SKILL.md</label>
                  {loadingSkillDraft && (
                    <div className="rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-[11.5px] text-muted-foreground">
                      正在读取已有 Skill...
                    </div>
                  )}
                  <Textarea
                    value={skillMd}
                    onChange={(event) => {
                      setSkillMd(event.target.value)
                      setSkillMdEdited(true)
                    }}
                    disabled={loadingSkillDraft}
                    spellCheck={false}
                    className="min-h-[320px] resize-y font-mono text-[12px] leading-relaxed"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-medium text-foreground">资源文件</div>
                    <button
                      onClick={() => handleAddResource(resourceKinds[0] ?? "references")}
                      disabled={loadingSkillDraft}
                      className="rounded-md border border-border/70 px-2 py-1 text-[11px] transition hover:bg-secondary"
                    >
                      添加文本文件
                    </button>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {resources.map((resource, index) => (
                      <div key={`${resource.path}-${index}`} className="rounded-lg border border-border/60 bg-background/40 p-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={resource.path}
                            onChange={(event) => handleUpdateResource(index, { path: event.target.value })}
                            placeholder="references/context.md"
                            className="h-8 font-mono text-[11px]"
                          />
                          <button
                            onClick={() => handleRemoveResource(index)}
                            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                            aria-label="删除资源文件"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Textarea
                          value={resource.content}
                          onChange={(event) => handleUpdateResource(index, { content: event.target.value })}
                          spellCheck={false}
                          className="mt-2 min-h-24 resize-y font-mono text-[11px] leading-relaxed"
                        />
                      </div>
                    ))}
                    {resources.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[12px] text-muted-foreground">
                        还没有资源文件。
                      </div>
                    )}
                  </div>
                </div>

                {(warnings.length > 0 || createError) && (
                  <div className="space-y-1 rounded-lg border border-border/70 bg-muted/35 p-3 text-[11.5px] leading-relaxed">
                    {createError && <div className="font-medium text-destructive">{createError}</div>}
                    {warnings.map((warning, index) => (
                      <div key={`${warning}-${index}`} className="text-muted-foreground">
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <button
                onClick={() => {
                  setCreateOpen(false)
                  setEditingSkillName(null)
                }}
                disabled={savingSkill}
                className="rounded-md border border-border/70 px-3 py-2 text-[12px] transition hover:bg-secondary disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveSkill}
                disabled={savingSkill || generating || loadingSkillDraft}
                className="rounded-md bg-foreground px-3 py-2 text-[12px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
              >
                {savingSkill ? "保存中..." : isEditingSkill ? "保存修改" : "创建 Skill"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid gap-3 md:grid-cols-2">
          {skills.map((skill) => {
            const isStyleGuide = skill.id === styleSkill?.id
            const canEditSkill = !isStyleGuide && skillDirectoryName(skill) !== null
            return (
              <div
                key={skill.id}
                className="paper rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground/80" />
                      <span className="font-serif text-[15px] text-foreground">
                        {skillDisplayName(skill)}
                      </span>
                      {skill?.dirty ? (
                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                          需要刷新
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                          最新
                        </span>
                      )}
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {skillKindLabel(skill)}
                      </span>
                    </div>
                    {skill.description && (
                      <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
                        {skill.description}
                      </p>
                    )}
                  </div>
                  {canEditSkill && (
                    <button
                      onClick={() => openEditSkillDialog(skill)}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition hover:bg-secondary"
                    >
                      <PenLine className="h-3 w-3" />
                      编辑
                    </button>
                  )}
                  {isStyleGuide && (
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="shrink-0 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
                    >
                      {refreshing ? "刷新中…" : "刷新"}
                    </button>
                  )}
                </div>

                <div className="mt-4 space-y-1.5 text-[11.5px]">
                  <button
                    onClick={() => onOpenFile(skill.sourceFile)}
                    className="flex max-w-full items-center gap-2 text-left transition hover:text-foreground"
                  >
                    <span className="w-16 shrink-0 text-muted-foreground">源文件</span>
                    <span className="truncate font-mono text-foreground/80">{skill.sourceFile}</span>
                  </button>
                  {skill.summaryFile && (
                    <button
                      onClick={() => onOpenFile(skill.summaryFile!)}
                      className="flex max-w-full items-center gap-2 text-left transition hover:text-foreground"
                    >
                      <span className="w-16 shrink-0 text-muted-foreground">压缩层</span>
                      <span className="truncate font-mono text-foreground/80">{skill.summaryFile}</span>
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-muted-foreground">Token</span>
                    <span className="font-mono text-foreground/80">{skill.summaryTokenCount}</span>
                  </div>
                  {isStyleGuide && summary.trim() && (
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/55 p-3 font-serif text-[12px] leading-[1.75] text-foreground/90">
                      {summary}
                    </pre>
                  )}
                </div>
              </div>
            )
          })}
          {skills.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
              暂无 Skill。可以在 .claude/skills/ 下添加 SKILL.md。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
