# LG Runtime Agent Eval Cases

These are documented regression cases for the novel-engineering runtime. They are not an automated test runner yet.

## Case 1: Advanced Agent Request

Input:

> 我要的是高级智能体，不是加某一条规则。

Expected:

- `taskModel.taskType = system_improvement`.
- `taskModel.artifactLevel = agent_system`.
- `selfImprovement.triggered = true`.
- Reply identifies runtime-level gaps: task model, context fragments, tool semantics, artifact graph, turn loop, memory/compaction.
- No book ActionPlan.

## Case 2: Creative Review With No Mutation

Input:

> 你觉得这章写得怎么样？顺便看下有没有把第一卷设定塞太多。

Expected:

- May use `creative_diagnosis`.
- `actionDecision.shouldCreateActionPlan = false`.
- `proposalNodes = []`.
- Reply focuses on chapter function, setting release, pacing, character drive, and volume/chapter granularity.

## Case 3: Prompt Granularity Diagnosis

Input:

> 这提示词是不是把第一卷内容都塞进第一章了？

Expected:

- `taskModel.taskType = creative_review` or `prompt_design`.
- Reply identifies an artifact hierarchy problem.
- Suggests building a first-volume coarse outline and first-chapter scene goal before asking Gemini to write prose.
- No book ActionPlan.

## Case 4: Explicit Book Mutation

Input:

> 把顾慎当前位置更新为第三矿区阵眼，并记录这是第一章结尾状态。

Expected:

- `taskModel.needsBookMutation = true`.
- Uses `book_mutation_propose`.
- `proposalNodes.length > 0`.
- Right sidebar shows a pending ActionPlan.

## Case 5: Gemini Brief Boundaries

Input:

> 生成发给 Gemini 的第一章提示词，但不要把第一卷内容一次塞完。

Expected:

- Uses `prompt_brief_design`.
- Mentions missing upstream artifacts if volume/chapter outline is absent.
- Produces a directly usable Gemini brief with chapter function, scene goal, information boundary, and ending hook.
- No ActionPlan.

## Case 6: Agent Memory Without Book Pollution

Input:

> 我不满意，你刚才像个入库工具。

Expected:

- `selfImprovement.triggered = true`.
- Failure chain mentions premature ActionPlan/tool timing.
- Writes global agent memory through self-improvement or `agent_memory_record`.
- Does not write book files or create book ActionPlan.

## Case 7: System Outline Capability, Not Book Outline File

Input:

> 当前系统是不是没有大纲设计

Expected:

- `taskModel.targetDomain = agent_system`.
- `taskModel.taskType = system_improvement`.
- `taskModel.artifactLevel = agent_system`.
- Uses `agent_capability_diagnosis`.
- Reply diagnoses LG runtime outline-design capability, not missing book outline files.
- No ActionPlan.

## Case 8: Explicit Correction Carries Forward

Conversation:

> 当前系统是不是没有大纲设计
> 我说的是系统改进
> 你知道要改进，那你知道要怎么改进吗

Expected:

- The final turn remains `targetDomain = agent_system`.
- Reply gives implementation-level changes: meta intent resolution, outline artifact graph, chapter function boundary, upstream artifact detection, Gemini brief boundaries, eval cases.
- Does not ask whether to create a volume outline or chapter outline file.

## Case 9: Book Outline Planning Still Works

Input:

> 帮我设计第一卷大纲

Expected:

- `taskModel.targetDomain = book_content`.
- `taskModel.taskType = planning`.
- May give creative planning advice.
- Does not create ActionPlan unless the user explicitly asks to save/update/write the outline.

## Case 10: Explicit Book Outline Save

Input:

> 把第一卷大纲保存下来

Expected:

- `taskModel.targetDomain = book_content`.
- `taskModel.taskType = file_update`.
- `taskModel.needsBookMutation = true`.
- May use `book_mutation_propose`.

## Case 11: Capability Brief Must Be Visible

Input:

> 当前系统是不是没有大纲设计

Failure pattern:

- Reply says "以下为具体的 Codex 实现 brief 和评估用例" but does not show the actual brief or eval cases.

Expected:

- Uses `agent_capability_diagnosis`.
- Visible assistant reply includes a concrete `Codex 实现 Brief` section with implementation items such as `TaskModeler`, `Meta Intent Resolution`, `ArtifactGraph`, `prompt_brief_design`, or `agent_capability_diagnosis`.
- Visible assistant reply or the message brief panel includes concrete eval cases with expected `targetDomain`, `taskType`, and ActionPlan behavior.
- `brief.selfImprovement.codexBrief` and `brief.selfImprovement.proposedEvalCases` are populated.
- No book ActionPlan.

## Case 12: Outline Design Is A Runtime Capability

Input:

> 看看怎么给系统加大纲

Expected:

- Interprets this as improving LG runtime outline capability, not creating one book outline immediately.
- Reply explains outline artifact graph: book -> volume outline -> chapter outline -> scene goal -> prompt/writing.
- Mentions `outline_design`, upstream artifact gap detection, and `outline_update` only for explicit saves.
- No book ActionPlan unless the user explicitly asks to save/update/write a specific outline.

## Case 13: Book Outline Planning Does Not Auto-Save

Input:

> 帮我设计第一卷大纲

Expected:

- `taskModel.targetDomain = book_content`.
- Uses or references `outline_design`.
- Produces creative outline advice.
- `actionDecision.shouldCreateActionPlan = false`.

## Case 14: Explicit Outline Save Creates Proposal

Input:

> 把第一卷大纲保存下来：第一卷围绕顾慎借欺天大阵躲过天轮审查展开。

Expected:

- `taskModel.targetDomain = book_content`.
- `taskModel.taskType = file_update`.
- Produces an `outline_update` action.
- Uses `book_mutation_propose`.
- Right sidebar shows a pending ActionPlan targeting `卷纲/第一卷.md`.

## Case 15: First Chapter Brief Uses Outline Gaps

Input:

> 生成发给 Gemini 的第一章提示词

Expected:

- Uses `outline_design` and `prompt_brief_design`.
- If no volume/chapter outline exists, missing artifacts include `卷纲` or `第一章章纲或场景目标`.
- Reply constrains the first chapter to opening hook, one concrete action, protagonist decision, limited exposition, and ending hook.
- No ActionPlan.
