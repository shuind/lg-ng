import type {
  SkillExperimentEntry,
  SkillExperimentMode,
  SkillExperimentResult,
  SkillTrial,
  SkillTrialSampleSource,
  SkillTrialVerdict,
} from "@/lib/types"
import { callChatCompletion, getConfig } from "@/lib/server/llm"
import { appendSkillTrial, readWorkspaceSkillDraft, setSkillTrialVerdict } from "@/lib/server/skill-service"
import { normalizeSkillName, SkillValidationError } from "@/lib/server/skill-validation"

type CreateSkillTrialInput = {
  skillName: string
  sampleText: string
  sampleSource?: SkillTrialSampleSource
}

type RunSkillExperimentInput = {
  entry?: SkillExperimentEntry
  mode?: SkillExperimentMode
  instruction: string
  baselineInstruction?: string
  sampleText: string
  sampleSource?: SkillTrialSampleSource
  targetSkillName?: string
}

const MAX_EXPERIMENT_INSTRUCTION_CHARS = 6000
const MAX_EXPERIMENT_SAMPLE_CHARS = 8000

function clipText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trim() : trimmed
}

function normalizeEntry(value: unknown): SkillExperimentEntry {
  if (value === "from_lead" || value === "improve_skill") return value
  return "scratch"
}

function normalizeMode(value: unknown): SkillExperimentMode {
  if (value === "a_b") return "a_b"
  return "with_without"
}

function normalizeSampleSource(value: unknown): SkillTrialSampleSource {
  if (value === "ledger" || value === "editor" || value === "paste") return value
  return "paste"
}

function normalizeVerdict(value: unknown): SkillTrialVerdict {
  if (value === "helped" || value === "no_diff" || value === "hurt") return value
  throw new SkillValidationError("A/B 判定只能是 helped、no_diff 或 hurt。")
}

function trialPrompt(sampleText: string): string {
  return [
    "请改写下面这段中文小说文本。",
    "保持情节事实不变，改善表达、节奏、动作和信息呈现。",
    "只返回改写后的正文，不要解释，不要写标题。",
    "",
    sampleText.trim(),
  ].join("\n")
}

async function runTextRewrite(sampleText: string, instruction?: string): Promise<string> {
  const config = getConfig()
  if (!config) throw new Error("当前没有可用的模型通道，无法运行 A/B 探针。")

  const system = instruction
    ? [
        "你是中文小说写作助手。你会遵循下面的试验指令，但这次只能返回纯文本改写结果，绝不能写入、读取或修改任何项目文件。",
        "",
        "试验指令:",
        instruction,
      ].join("\n")
    : "你是中文小说写作助手。这次只能返回纯文本改写结果，绝不能写入、读取或修改任何项目文件。"

  const result = await callChatCompletion(
    config,
    [
      { role: "system", content: system },
      { role: "user", content: trialPrompt(sampleText) },
    ],
    { temperature: 0.2, maxTokens: 1800, feature: "skill_trial" },
  )
  return result.content.trim()
}

async function resolveBaselineInstruction(bookId: string, input: RunSkillExperimentInput): Promise<string> {
  const direct = clipText(input.baselineInstruction ?? "", MAX_EXPERIMENT_INSTRUCTION_CHARS)
  if (direct) return direct
  if (!input.targetSkillName) return ""
  const skillName = normalizeSkillName(input.targetSkillName)
  if (!skillName) return ""
  const draft = await readWorkspaceSkillDraft(bookId, skillName)
  return clipText(draft.skillMd, MAX_EXPERIMENT_INSTRUCTION_CHARS)
}

export async function runSkillExperiment(
  bookId: string,
  input: RunSkillExperimentInput,
): Promise<SkillExperimentResult> {
  const instruction = clipText(input.instruction, MAX_EXPERIMENT_INSTRUCTION_CHARS)
  if (instruction.length < 8) throw new SkillValidationError("请先写一条要试验的指令。")

  const sampleText = clipText(input.sampleText, MAX_EXPERIMENT_SAMPLE_CHARS)
  if (sampleText.length < 20) throw new SkillValidationError("样本文本太短，无法进行 A/B 试验。")

  const mode = normalizeMode(input.mode)
  const entry = normalizeEntry(input.entry)
  const baselineInstruction = mode === "a_b" ? await resolveBaselineInstruction(bookId, input) : ""
  const [outputA, outputB] = await Promise.all([
    runTextRewrite(sampleText, mode === "a_b" ? baselineInstruction : undefined),
    runTextRewrite(sampleText, instruction),
  ])

  return {
    id: `experiment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    entry,
    mode,
    instruction,
    baselineInstruction: baselineInstruction || undefined,
    sampleText,
    sampleSource: normalizeSampleSource(input.sampleSource),
    targetSkillName: input.targetSkillName ? normalizeSkillName(input.targetSkillName) || undefined : undefined,
    outputA,
    outputB,
    createdAt: new Date().toISOString(),
  }
}

export async function runSkillTrial(bookId: string, input: CreateSkillTrialInput): Promise<SkillTrial> {
  const skillName = normalizeSkillName(input.skillName)
  if (!skillName) throw new SkillValidationError("缺少有效的 Skill 短名。")
  const sampleText = input.sampleText.trim()
  if (sampleText.length < 20) throw new SkillValidationError("样本文本太短，无法进行 A/B 探针。")

  const draft = await readWorkspaceSkillDraft(bookId, skillName)
  const [outputWithout, outputWith] = await Promise.all([
    runTextRewrite(sampleText),
    runTextRewrite(sampleText, draft.skillMd),
  ])

  const trial: SkillTrial = {
    id: `trial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    skillName,
    sampleSource: normalizeSampleSource(input.sampleSource),
    sampleText,
    outputWithout,
    outputWith,
    verdict: null,
    createdAt: new Date().toISOString(),
  }
  return appendSkillTrial(bookId, skillName, trial)
}

export async function recordSkillTrialVerdict(
  bookId: string,
  trialId: string,
  value: unknown,
  judgeNote?: string,
): Promise<SkillTrial> {
  return setSkillTrialVerdict(bookId, trialId, normalizeVerdict(value), judgeNote)
}
