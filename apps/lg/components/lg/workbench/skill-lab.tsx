"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Beaker, Check, CheckCircle2, Eye, FileText, FlaskConical, Lightbulb, Play, RefreshCw, RotateCcw, Save, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react"
import type {
  LedgerEntry,
  Skill,
  SkillExperimentEntry,
  SkillExperimentMode,
  SkillExperimentResult,
  SkillLabResponse,
  SkillSuggestion,
  SkillTrial,
  SkillTrialVerdict,
} from "@/lib/types"
import {
  analyzeSkillLab,
  dismissSkillSuggestion,
  listLedgerEntries,
  listSkillLab,
  listSkills,
  promoteSkill,
  recordSkillTrialVerdict,
  runSkillTrial,
  runSkillExperiment,
  saveSkillExperiment,
} from "@/lib/api"
import { DiffBlock } from "@/components/lg/chat-panel/diff-block"
import { LoadingPane } from "./shared"
import { formatLedgerSummary, formatLedgerTimestamp } from "./ledger-utils"
import { skillDirectoryName, skillDisplayName } from "./skill-pane-utils"
import { formatWorkbenchTimestamp } from "./workbench-utils"

const MIN_ANALYZE_SAMPLES = 2
const MAX_ANALYZE_SAMPLES = 12
const MAX_ANALYZE_DIFF_CHARS = 12000
const SAMPLE_LEDGER_LIMIT = 60

type BenchState = {
  entry: SkillExperimentEntry
  mode: SkillExperimentMode
  instruction: string
  baselineInstruction: string
  sampleText: string
  sampleSource: "paste" | "ledger" | "editor"
  nameHint: string
  title: string
  sourceSuggestionId?: string
  targetSkillName?: string
  result: SkillExperimentResult | null
}

function emptyBench(): BenchState {
  return {
    entry: "scratch",
    mode: "with_without",
    instruction: "",
    baselineInstruction: "",
    sampleText: "",
    sampleSource: "paste",
    nameHint: "",
    title: "",
    result: null,
  }
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function emptyUsage(skill: Skill) {
  return skill.usage ?? {
    timesUsed: 0,
    timesRewritten: 0,
    rewriteRate: 0,
    recentRewrites: [],
  }
}

function trialCounts(trials: SkillTrial[] = []) {
  return {
    helped: trials.filter((trial) => trial.verdict === "helped").length,
    noDiff: trials.filter((trial) => trial.verdict === "no_diff").length,
    hurt: trials.filter((trial) => trial.verdict === "hurt").length,
  }
}

function diffCharCount(entry: LedgerEntry): number {
  return entry.diffPatch?.length ?? 0
}

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 1.5)
}

function isAnalyzableLedgerEntry(entry: LedgerEntry): boolean {
  return Boolean(entry.diffPatch && entry.targetPath && entry.targetPath !== "ledger.jsonl")
}

function actorLabel(actor: LedgerEntry["actor"]): string {
  return actor === "agent" ? "AI" : "用户"
}

export function SkillLabPane({ bookId, onOpenFile }: { bookId: string; onOpenFile: (path: string) => void }) {
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [analyzedAt, setAnalyzedAt] = useState("")
  const [analyzedRevisionCount, setAnalyzedRevisionCount] = useState(0)
  const [modelConfigured, setModelConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [samplePickerOpen, setSamplePickerOpen] = useState(false)
  const [sampleEntries, setSampleEntries] = useState<LedgerEntry[]>([])
  const [sampleLoading, setSampleLoading] = useState(false)
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([])
  const [sampleFocus, setSampleFocus] = useState("")
  const [previewEntry, setPreviewEntry] = useState<LedgerEntry | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [bench, setBench] = useState<BenchState>(() => emptyBench())
  const [runningBench, setRunningBench] = useState(false)
  const [savingBench, setSavingBench] = useState(false)
  const [promotingName, setPromotingName] = useState<string | null>(null)
  const [runningTrialName, setRunningTrialName] = useState<string | null>(null)
  const [verdictingTrialId, setVerdictingTrialId] = useState<string | null>(null)
  const [trialTextBySkill, setTrialTextBySkill] = useState<Record<string, string>>({})
  const [error, setError] = useState("")

  const reloadSkills = useCallback(async () => {
    setSkills(await listSkills(bookId))
  }, [bookId])

  const loadSamples = useCallback(async () => {
    setSampleLoading(true)
    try {
      const page = await listLedgerEntries(bookId, { limit: SAMPLE_LEDGER_LIMIT })
      const entries = page.entries.filter(isAnalyzableLedgerEntry)
      setSampleEntries(entries)
      setSelectedEntryIds((current) => current.filter((id) => entries.some((entry) => entry.id === id)))
      setPreviewEntry((current) => current && entries.some((entry) => entry.id === current.id) ? current : null)
    } finally {
      setSampleLoading(false)
    }
  }, [bookId])

  const applyResponse = useCallback((res: SkillLabResponse) => {
    setSuggestions(res.suggestions)
    setAnalyzedAt(res.analyzedAt)
    setAnalyzedRevisionCount(res.analyzedRevisionCount)
    setModelConfigured(res.modelConfigured)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [lab, skillList, ledgerPage] = await Promise.all([
        listSkillLab(bookId),
        listSkills(bookId),
        listLedgerEntries(bookId, { limit: SAMPLE_LEDGER_LIMIT }),
      ])
      applyResponse(lab)
      setSkills(skillList)
      setSampleEntries(ledgerPage.entries.filter(isAnalyzableLedgerEntry))
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取 Skill Lab 失败。")
    } finally {
      setLoading(false)
    }
  }, [bookId, applyResponse])

  useEffect(() => {
    void load()
  }, [load])

  const selectedSampleEntries = useMemo(
    () => selectedEntryIds.flatMap((id) => sampleEntries.find((entry) => entry.id === id) ?? []),
    [sampleEntries, selectedEntryIds],
  )
  const selectedDiffChars = useMemo(
    () => selectedSampleEntries.reduce((sum, entry) => sum + diffCharCount(entry), 0),
    [selectedSampleEntries],
  )
  const selectedTokenEstimate = estimateTokens(selectedDiffChars)
  const analyzeBlockReason = useMemo(() => {
    if (selectedEntryIds.length === 0) return "请选择至少 2 条改稿样本。"
    if (selectedEntryIds.length < MIN_ANALYZE_SAMPLES) return "至少选择 2 条改稿样本。"
    if (selectedEntryIds.length > MAX_ANALYZE_SAMPLES) return `一次最多选择 ${MAX_ANALYZE_SAMPLES} 条改稿样本。`
    if (selectedDiffChars > MAX_ANALYZE_DIFF_CHARS) return `选中的 diff 约 ${selectedDiffChars} 字符，已超过 ${MAX_ANALYZE_DIFF_CHARS} 字符预算。`
    return ""
  }, [selectedDiffChars, selectedEntryIds.length])

  function handleToggleSample(entry: LedgerEntry) {
    setSelectedEntryIds((current) => {
      if (current.includes(entry.id)) return current.filter((id) => id !== entry.id)
      if (current.length >= MAX_ANALYZE_SAMPLES) return current
      return [...current, entry.id]
    })
  }

  async function handleAnalyze() {
    if (analyzeBlockReason) {
      setError(analyzeBlockReason)
      setSamplePickerOpen(true)
      return
    }
    setAnalyzing(true)
    setError("")
    try {
      applyResponse(await analyzeSkillLab(bookId, {
        ledgerEntryIds: selectedEntryIds,
        focus: sampleFocus,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析改稿失败。")
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleDismiss(id: string) {
    setError("")
    try {
      applyResponse(await dismissSkillSuggestion(bookId, id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "忽略观察失败。")
    }
  }

  function handleSendToBench(suggestion: SkillSuggestion) {
    const isImprove = suggestion.kind === "improve"
    const rules = suggestion.proposedRules?.length
      ? `\n\n规则：\n${suggestion.proposedRules.map((rule) => `- ${rule}`).join("\n")}`
      : ""
    setBench({
      entry: isImprove ? "improve_skill" : "from_lead",
      mode: isImprove ? "a_b" : "with_without",
      instruction: isImprove
        ? suggestion.proposedChange ?? suggestion.observation
        : `${suggestion.observation}${rules}`,
      baselineInstruction: "",
      sampleText: "",
      sampleSource: "paste",
      nameHint: isImprove
        ? `${suggestion.targetSkillName ?? "skill"}-experiment`
        : suggestion.proposedName ?? "experimental-skill",
      title: suggestion.title,
      sourceSuggestionId: suggestion.id,
      targetSkillName: suggestion.targetSkillName,
      result: null,
    })
    setError("")
  }

  async function handleRunBench() {
    setRunningBench(true)
    setError("")
    try {
      const result = await runSkillExperiment(bookId, {
        entry: bench.entry,
        mode: bench.mode,
        instruction: bench.instruction,
        baselineInstruction: bench.baselineInstruction,
        sampleText: bench.sampleText,
        sampleSource: bench.sampleSource,
        targetSkillName: bench.targetSkillName,
      })
      setBench((current) => ({ ...current, result }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "试验台 A/B 运行失败。")
    } finally {
      setRunningBench(false)
    }
  }

  async function handleSaveBench() {
    setSavingBench(true)
    setError("")
    try {
      const result = await saveSkillExperiment(bookId, {
        nameHint: bench.nameHint,
        title: bench.title,
        instruction: bench.instruction,
        sampleText: bench.sampleText,
        sourceSuggestionId: bench.sourceSuggestionId,
        originExperimentId: bench.result?.id,
      })
      applyResponse(result.lab)
      await reloadSkills()
      setBench((current) => ({
        ...current,
        sourceSuggestionId: undefined,
        nameHint: "",
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存实验 Skill 失败。")
    } finally {
      setSavingBench(false)
    }
  }

  async function handlePromote(skill: Skill) {
    const name = skillDirectoryName(skill)
    if (!name) return
    setPromotingName(name)
    setError("")
    try {
      await promoteSkill(bookId, name)
      await reloadSkills()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skill 毕业失败。")
    } finally {
      setPromotingName(null)
    }
  }

  async function handleRunTrial(skill: Skill) {
    const name = skillDirectoryName(skill)
    const sampleText = name ? trialTextBySkill[name]?.trim() : ""
    if (!name || !sampleText) return
    setRunningTrialName(name)
    setError("")
    try {
      await runSkillTrial(bookId, { skillName: name, sampleText, sampleSource: "paste" })
      setTrialTextBySkill((current) => ({ ...current, [name]: "" }))
      await reloadSkills()
    } catch (err) {
      setError(err instanceof Error ? err.message : "A/B 探针运行失败。")
    } finally {
      setRunningTrialName(null)
    }
  }

  async function handleVerdict(trialId: string, verdict: SkillTrialVerdict) {
    setVerdictingTrialId(trialId)
    setError("")
    try {
      await recordSkillTrialVerdict(bookId, trialId, verdict)
      await reloadSkills()
    } catch (err) {
      setError(err instanceof Error ? err.message : "记录 A/B 判定失败。")
    } finally {
      setVerdictingTrialId(null)
    }
  }

  const observations = useMemo(
    () => suggestions.filter((suggestion) => suggestion.status !== "dismissed" && suggestion.status !== "incubated"),
    [suggestions],
  )
  const experimentalSkills = useMemo(
    () => skills.filter((skill) => skill.stage === "experimental"),
    [skills],
  )

  if (loading) return <LoadingPane />

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin px-10 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Beaker className="h-4 w-4 text-muted-foreground" />
                <div className="font-serif text-[16px] text-foreground">Skill Lab</div>
              </div>
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
                试验台为主 · 线索只送试验
              </span>
            </div>
            {analyzedAt && (
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                上次找线索：{formatWorkbenchTimestamp(analyzedAt)} · 入模 {analyzedRevisionCount} 条选中样本
              </p>
            )}
          </div>
          <button
            onClick={() => setSamplePickerOpen((open) => !open)}
            disabled={!modelConfigured}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
          >
            <Beaker className="h-3 w-3" />
            {samplePickerOpen ? "收起线索样本" : "从最近使用找线索"}
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        {samplePickerOpen && modelConfigured && (
          <SamplePicker
            entries={sampleEntries}
            selectedIds={selectedEntryIds}
            focus={sampleFocus}
            loading={sampleLoading}
            analyzing={analyzing}
            blockReason={analyzeBlockReason}
            selectedDiffChars={selectedDiffChars}
            selectedTokenEstimate={selectedTokenEstimate}
            previewEntry={previewEntry}
            onFocusChange={setSampleFocus}
            onToggleSample={handleToggleSample}
            onPreview={setPreviewEntry}
            onAnalyze={handleAnalyze}
            onReload={loadSamples}
          />
        )}

        {!modelConfigured ? (
          <EmptyState>当前没有可用的模型通道。请在设置里启用余额通道，或保存自己的 API Key 后再使用试验台。</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <ExperimentBench
                bench={bench}
                running={runningBench}
                saving={savingBench}
                onChange={(patch) => setBench((current) => ({ ...current, ...patch }))}
                onRun={handleRunBench}
                onSave={handleSaveBench}
                onReset={() => {
                  setBench(emptyBench())
                  setError("")
                }}
              />

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="text-[12px] font-medium text-foreground">实验中的 Skill</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{experimentalSkills.length} 条</div>
                </div>
                {experimentalSkills.length === 0 ? (
                  <EmptyState>还没有实验中的 Skill。可以直接在试验台打磨一条指令，满意后再保存。</EmptyState>
                ) : (
                  experimentalSkills.map((skill) => {
                    const name = skillDirectoryName(skill) ?? skill.id
                    return (
                      <ExperimentSkillCard
                        key={skill.id}
                        skill={skill}
                        promoting={promotingName === name}
                        trialText={trialTextBySkill[name] ?? ""}
                        runningTrial={runningTrialName === name}
                        verdictingTrialId={verdictingTrialId}
                        onPromote={() => handlePromote(skill)}
                        onTrialTextChange={(value) => setTrialTextBySkill((current) => ({ ...current, [name]: value }))}
                        onRunTrial={() => handleRunTrial(skill)}
                        onVerdict={handleVerdict}
                        onOpenFile={onOpenFile}
                      />
                    )
                  })
                )}
              </section>
            </div>

            <aside className="min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="text-[12px] font-medium text-foreground">线索流</div>
                </div>
                <div className="text-[11px] text-muted-foreground">{observations.length} 条</div>
              </div>
              {observations.length === 0 ? (
                <EmptyState>
                  {analyzedAt
                    ? "这次没有发现明显线索。继续写作或改稿后，再从最近使用里提取。"
                    : "点上方“从最近使用找线索”，线索会出现在这里；也可以直接空手使用试验台。"}
                </EmptyState>
              ) : (
                <div className="space-y-3">
                  {observations.map((suggestion) => (
                    <SkillSuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onSendToBench={() => handleSendToBench(suggestion)}
                      onDismiss={() => handleDismiss(suggestion.id)}
                      onOpenFile={onOpenFile}
                    />
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-background/35 px-3 py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}

function ExperimentBench({
  bench,
  running,
  saving,
  onChange,
  onRun,
  onSave,
  onReset,
}: {
  bench: BenchState
  running: boolean
  saving: boolean
  onChange: (patch: Partial<BenchState>) => void
  onRun: () => void
  onSave: () => void
  onReset: () => void
}) {
  const instruction = bench.instruction.trim()
  const sampleText = bench.sampleText.trim()
  const canRun = instruction.length >= 8 && sampleText.length >= 20 && !running
  const canSave = Boolean(bench.result) && instruction.length >= 8 && !saving
  const entryLabel = bench.entry === "from_lead"
    ? "来自线索"
    : bench.entry === "improve_skill"
      ? "改进现有 Skill"
      : "空手试验"
  const resultLabelA = bench.mode === "a_b" ? "A · 旧版/基线" : "A · 不带指令"
  const resultLabelB = bench.mode === "a_b" ? "B · 当前指令" : "B · 带当前指令"

  return (
    <section className="paper rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Beaker className="h-4 w-4 text-muted-foreground" />
            <div className="font-serif text-[15px] text-foreground">试验台</div>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {entryLabel}
            </span>
            {bench.targetSkillName && (
              <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {bench.targetSkillName}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition hover:bg-secondary"
        >
          <RotateCcw className="h-3 w-3" />
          清空
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <label className="block">
          <span className="text-[11px] font-medium text-foreground">指令</span>
          <textarea
            value={bench.instruction}
            onChange={(event) => onChange({ instruction: event.target.value, result: null })}
            placeholder="写一条想试的提示词。可以从零开始，也可以从右侧线索预填。"
            className="mt-1.5 min-h-36 w-full resize-y rounded-md border border-border/70 bg-background/55 px-3 py-2 text-[12px] leading-relaxed outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/40"
          />
        </label>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium text-foreground">保存短名</span>
            <input
              value={bench.nameHint}
              onChange={(event) => onChange({ nameHint: event.target.value })}
              placeholder="experimental-skill"
              className="mt-1.5 h-8 w-full rounded-md border border-border/70 bg-background/55 px-2.5 font-mono text-[11.5px] outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/40"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-foreground">标题</span>
            <input
              value={bench.title}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="给这次试验起个名字"
              className="mt-1.5 h-8 w-full rounded-md border border-border/70 bg-background/55 px-2.5 text-[11.5px] outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/40"
            />
          </label>
          <div>
            <div className="text-[11px] font-medium text-foreground">比较方式</div>
            <div className="mt-1.5 grid grid-cols-2 rounded-md border border-border/70 bg-background/45 p-0.5">
              <BenchModeButton active={bench.mode === "with_without"} onClick={() => onChange({ mode: "with_without", result: null })}>
                带/不带
              </BenchModeButton>
              <BenchModeButton active={bench.mode === "a_b"} onClick={() => onChange({ mode: "a_b", result: null })}>
                A/B 版本
              </BenchModeButton>
            </div>
          </div>
        </div>
      </div>

      {bench.mode === "a_b" && !bench.targetSkillName && (
        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-foreground">A 版基线指令</span>
          <textarea
            value={bench.baselineInstruction}
            onChange={(event) => onChange({ baselineInstruction: event.target.value, result: null })}
            placeholder="可选。留空时 A 版按“不带指令”运行。"
            className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-border/70 bg-background/55 px-3 py-2 text-[12px] leading-relaxed outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/40"
          />
        </label>
      )}

      <label className="mt-3 block">
        <span className="text-[11px] font-medium text-foreground">样本</span>
        <textarea
          value={bench.sampleText}
          onChange={(event) => onChange({ sampleText: event.target.value, result: null })}
          placeholder="粘贴一段要改写的正文样本；A/B 只返回纯文本结果，不写项目文件。"
          className="mt-1.5 min-h-32 w-full resize-y rounded-md border border-border/70 bg-background/55 px-3 py-2 text-[12px] leading-relaxed outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/40"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] text-muted-foreground">
          {canRun ? "样本和指令就绪。" : "至少需要 8 字指令和 20 字样本。"}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
          >
            <Play className="h-3 w-3" />
            {running ? "运行中…" : "跑 A/B"}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-3 py-1.5 text-[11.5px] font-medium text-foreground transition hover:bg-secondary disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            {saving ? "保存中…" : "存成 Skill（实验中）"}
          </button>
        </div>
      </div>

      {bench.result && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="mb-2 font-mono text-[10.5px] text-muted-foreground">
            {formatWorkbenchTimestamp(bench.result.createdAt)}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <TrialColumn label={resultLabelA} text={bench.result.outputA} />
            <TrialColumn label={resultLabelB} text={bench.result.outputB} />
          </div>
        </div>
      )}
    </section>
  )
}

function BenchModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-[11px] transition ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function SamplePicker({
  entries,
  selectedIds,
  focus,
  loading,
  analyzing,
  blockReason,
  selectedDiffChars,
  selectedTokenEstimate,
  previewEntry,
  onFocusChange,
  onToggleSample,
  onPreview,
  onAnalyze,
  onReload,
}: {
  entries: LedgerEntry[]
  selectedIds: string[]
  focus: string
  loading: boolean
  analyzing: boolean
  blockReason: string
  selectedDiffChars: number
  selectedTokenEstimate: number
  previewEntry: LedgerEntry | null
  onFocusChange: (value: string) => void
  onToggleSample: (entry: LedgerEntry) => void
  onPreview: (entry: LedgerEntry) => void
  onAnalyze: () => void
  onReload: () => void
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  return (
    <section className="mb-5 rounded-md border border-border/70 bg-card/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
            <Beaker className="h-3.5 w-3.5 text-muted-foreground" />
            选择改稿样本
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            已选 {selectedIds.length}/{MAX_ANALYZE_SAMPLES} 条 · diff {selectedDiffChars}/{MAX_ANALYZE_DIFF_CHARS} 字符 · 约 {selectedTokenEstimate} tokens
          </p>
        </div>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      <textarea
        value={focus}
        onChange={(event) => onFocusChange(event.target.value)}
        placeholder="这次想找什么规律/想验证什么假设（可选）"
        className="mt-3 min-h-20 w-full resize-y rounded-md border border-border/70 bg-background/55 px-3 py-2 text-[12px] leading-relaxed outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/40"
      />

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div className="min-h-0 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>近期可分析改稿</span>
            {loading && <span>读取中...</span>}
          </div>
          {entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-[12px] text-muted-foreground">
              暂时没有带 diff 的改稿样本。
            </div>
          ) : (
            <div className="max-h-96 space-y-1.5 overflow-auto pr-1 scrollbar-thin">
              {entries.map((entry) => (
                <SampleRow
                  key={entry.id}
                  entry={entry}
                  selected={selectedSet.has(entry.id)}
                  previewing={previewEntry?.id === entry.id}
                  selectionFull={selectedIds.length >= MAX_ANALYZE_SAMPLES}
                  onToggle={() => onToggleSample(entry)}
                  onPreview={() => onPreview(entry)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {previewEntry ? (
            <DiffBlock
              title={previewEntry.targetPath}
              subtitle={`${formatLedgerTimestamp(previewEntry.timestamp)} · ${actorLabel(previewEntry.actor)} · ${formatLedgerSummary(previewEntry) ?? previewEntry.action}`}
              patch={previewEntry.diffPatch}
              variant="split"
              maxHeightClass="max-h-96"
            />
          ) : (
            <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-border/70 bg-background/35 px-3 py-6 text-center text-[12px] text-muted-foreground">
              点击样本查看 diff 预览。
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className={`text-[11px] ${blockReason ? "text-destructive" : "text-muted-foreground"}`}>
          {blockReason || "样本就绪，分析只会读取这些选中的 diff。"}
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || Boolean(blockReason)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
        >
          <Sparkles className="h-3 w-3" />
          {analyzing ? "分析中..." : "分析选中样本"}
        </button>
      </div>
    </section>
  )
}

function SampleRow({
  entry,
  selected,
  previewing,
  selectionFull,
  onToggle,
  onPreview,
}: {
  entry: LedgerEntry
  selected: boolean
  previewing: boolean
  selectionFull: boolean
  onToggle: () => void
  onPreview: () => void
}) {
  const chars = diffCharCount(entry)
  const disabled = selectionFull && !selected
  const summary = formatLedgerSummary(entry)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPreview}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onPreview()
        }
      }}
      className={`group rounded-md border px-2.5 py-2 text-left transition ${
        previewing ? "border-foreground/40 bg-background/70" : "border-border/60 bg-background/35 hover:bg-muted/35"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          disabled={disabled}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition disabled:opacity-35 ${
            selected
              ? "border-foreground bg-foreground text-background"
              : "border-border/80 bg-background/80 text-transparent hover:text-muted-foreground"
          }`}
          aria-label={selected ? "取消选择样本" : "选择样本"}
          title={selected ? "取消选择样本" : disabled ? `一次最多选择 ${MAX_ANALYZE_SAMPLES} 条` : "选择样本"}
        >
          <Check className="h-3 w-3" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground/75">
            <span className="font-mono">{formatLedgerTimestamp(entry.timestamp)}</span>
            <span>·</span>
            <span>{actorLabel(entry.actor)}</span>
            <span className="rounded-full border border-border/60 px-1.5 py-0.5">
              {chars} chars / ~{estimateTokens(chars)} tokens
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-foreground/85">{entry.targetPath}</div>
          <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {summary ?? entry.summary}
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onPreview()
          }}
          className="rounded-md p-1.5 text-muted-foreground opacity-80 transition hover:bg-secondary hover:text-foreground group-hover:opacity-100"
          aria-label="预览 diff"
          title="预览 diff"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function SkillSuggestionCard({
  suggestion,
  onSendToBench,
  onDismiss,
  onOpenFile,
}: {
  suggestion: SkillSuggestion
  onSendToBench: () => void
  onDismiss: () => void
  onOpenFile: (path: string) => void
}) {
  const isNew = suggestion.kind === "new"

  return (
    <article className="paper rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isNew ? (
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Lightbulb className="h-3.5 w-3.5 text-accent-foreground" />
            )}
            <div className="font-serif text-[14.5px] text-foreground">{suggestion.title}</div>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {isNew ? "新观察" : `改进 ${suggestion.targetSkillTitle ?? suggestion.targetSkillName}`}
            </span>
            {suggestion.status === "confirmed" && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                已确认
              </span>
            )}
            {suggestion.status === "drafted" && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                已生成草稿
              </span>
            )}
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              strength {percent(suggestion.strength)}
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              已在 {suggestion.seenInAnalyses} 轮分析出现
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{suggestion.observation}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onSendToBench}
            className="flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90"
          >
            <Beaker className="h-3 w-3" />
            拿去试验
          </button>
          <button
            onClick={onDismiss}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="忽略观察"
            title="忽略观察"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isNew && suggestion.proposedRules && suggestion.proposedRules.length > 0 && (
        <div className="mt-3 border-l border-border/70 pl-3">
          <div className="text-[11px] font-medium text-foreground">建议规则</div>
          <ul className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
            {suggestion.proposedRules.map((rule, index) => (
              <li key={index}>· {rule}</li>
            ))}
          </ul>
        </div>
      )}

      {!isNew && suggestion.proposedChange && (
        <div className="mt-3 border-l border-border/70 pl-3 text-[11.5px] leading-relaxed">
          <div className="text-[11px] font-medium text-foreground">建议改动</div>
          <div className="mt-1.5 text-muted-foreground">{suggestion.proposedChange}</div>
        </div>
      )}

      {suggestion.evidence.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-foreground">证据 · {suggestion.evidence.length} 次改稿</div>
          <div className="mt-1.5 space-y-1.5">
            {suggestion.evidence.map((item) => (
              <button
                key={`${item.ledgerEntryId}:${item.note}`}
                onClick={() => onOpenFile(item.targetPath)}
                className="flex w-full items-start gap-2 rounded-md bg-muted/30 px-3 py-2 text-left transition hover:bg-muted/50"
              >
                <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[10.5px] text-muted-foreground/70">{item.targetPath}</span>
                  <span className="block text-[11.5px] leading-relaxed text-muted-foreground">{item.note}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function ExperimentSkillCard({
  skill,
  promoting,
  trialText,
  runningTrial,
  verdictingTrialId,
  onPromote,
  onTrialTextChange,
  onRunTrial,
  onVerdict,
  onOpenFile,
}: {
  skill: Skill
  promoting: boolean
  trialText: string
  runningTrial: boolean
  verdictingTrialId: string | null
  onPromote: () => void
  onTrialTextChange: (value: string) => void
  onRunTrial: () => void
  onVerdict: (trialId: string, verdict: SkillTrialVerdict) => void
  onOpenFile: (path: string) => void
}) {
  const usage = emptyUsage(skill)
  const cleanUses = Math.max(0, usage.timesUsed - usage.timesRewritten)
  const trials = skill.trials ?? []
  const counts = trialCounts(trials)

  return (
    <article className="paper rounded-md border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <span className="font-serif text-[15px] text-foreground">{skillDisplayName(skill)}</span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
              实验中
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              探针 有效 {counts.helped} · 无差 {counts.noDiff} · 无用 {counts.hurt}
            </span>
          </div>
          {skill.description && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{skill.description}</p>
          )}
        </div>
        <button
          onClick={onPromote}
          disabled={promoting}
          className="flex shrink-0 items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
        >
          <CheckCircle2 className="h-3 w-3" />
          {promoting ? "毕业中" : "毕业"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 text-[11.5px] text-muted-foreground sm:grid-cols-3">
        <UsageMetric label="用了" value={`${usage.timesUsed} 次`} />
        <UsageMetric label="几乎没改" value={`${cleanUses} 次`} />
        <UsageMetric label="重写率" value={percent(usage.rewriteRate)} />
      </div>

      {usage.recentRewrites.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-foreground">最近重写</div>
          <div className="mt-1.5 space-y-1">
            {usage.recentRewrites.map((item) => (
              <button
                key={item.ledgerEntryId}
                onClick={() => onOpenFile(item.targetPath)}
                className="block w-full truncate rounded-md bg-muted/30 px-2 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground transition hover:bg-muted/50"
              >
                {item.targetPath} · {item.note}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2">
          <Beaker className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="text-[11px] font-medium text-foreground">A/B 探针</div>
        </div>
        <textarea
          value={trialText}
          onChange={(event) => onTrialTextChange(event.target.value)}
          placeholder="粘贴一段样本文本；A 不带 Skill，B 带 Skill，结果只返回纯文本。"
          className="mt-2 min-h-24 w-full resize-y rounded-md border border-border/70 bg-background/55 px-3 py-2 text-[12px] leading-relaxed outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/40"
        />
        <button
          onClick={onRunTrial}
          disabled={runningTrial || trialText.trim().length < 20}
          className="mt-2 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition hover:bg-secondary disabled:opacity-40"
        >
          {runningTrial ? "试跑中…" : "运行 A/B"}
        </button>
      </div>

      {trials.length > 0 && (
        <div className="mt-4 space-y-3">
          {trials.slice(0, 3).map((trial) => (
            <TrialResult
              key={trial.id}
              trial={trial}
              busy={verdictingTrialId === trial.id}
              onVerdict={(verdict) => onVerdict(trial.id, verdict)}
            />
          ))}
        </div>
      )}
    </article>
  )
}

function UsageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10.5px] text-muted-foreground/70">{label}</div>
      <div className="mt-0.5 font-serif text-[15px] text-foreground">{value}</div>
    </div>
  )
}

function TrialResult({
  trial,
  busy,
  onVerdict,
}: {
  trial: SkillTrial
  busy: boolean
  onVerdict: (verdict: SkillTrialVerdict) => void
}) {
  return (
    <div className="border-t border-border/60 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[10.5px] text-muted-foreground">{formatWorkbenchTimestamp(trial.createdAt)}</div>
        <div className="flex items-center gap-1">
          <VerdictButton active={trial.verdict === "helped"} busy={busy} onClick={() => onVerdict("helped")}>
            <ThumbsUp className="h-3 w-3" />
            有效
          </VerdictButton>
          <VerdictButton active={trial.verdict === "no_diff"} busy={busy} onClick={() => onVerdict("no_diff")}>
            没差别
          </VerdictButton>
          <VerdictButton active={trial.verdict === "hurt"} busy={busy} onClick={() => onVerdict("hurt")}>
            <ThumbsDown className="h-3 w-3" />
            没用
          </VerdictButton>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <TrialColumn label="A · 不带 Skill" text={trial.outputWithout} />
        <TrialColumn label="B · 带 Skill" text={trial.outputWith} />
      </div>
    </div>
  )
}

function VerdictButton({
  active,
  busy,
  onClick,
  children,
}: {
  active: boolean
  busy: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition disabled:opacity-50 ${
        active ? "bg-foreground text-background" : "border border-border/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function TrialColumn({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 rounded-md bg-background/55 p-3">
      <div className="mb-1 text-[10.5px] font-medium text-muted-foreground">{label}</div>
      <div className="max-h-64 overflow-auto whitespace-pre-wrap font-serif text-[12px] leading-[1.75] text-foreground/90">
        {text}
      </div>
    </div>
  )
}
