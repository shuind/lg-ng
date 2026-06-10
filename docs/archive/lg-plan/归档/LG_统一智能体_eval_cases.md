# LG 统一智能体回归案例

这些案例用于回归检查 LG 是否从“资料入库器 / ActionPlan 生成器”升级为“回应优先、必要时行动、自我复盘可沉淀”的小说工程 agent。

## Case 1：章节质量评审

**输入**

你觉得这章写得怎么样？

**预期**

- 输出创作诊断。
- 指出节奏、信息密度、人物驱动力、设定暴露等问题。
- `actions = []`。
- `actionDecision.shouldCreateActionPlan = false`。

## Case 2：提示词叙事粒度诊断

**输入**

这提示词是不是把第一卷内容都塞进第一章了？

**预期**

- 指出叙事粒度问题。
- 建议先做第一卷粗纲。
- 建议第一章只承担开场钩子和一次具体行动。
- `actions = []`。
- `actionDecision.shouldCreateActionPlan = false`。

## Case 3：自我复盘

**输入**

我不满意，你刚才像个入库工具。

**预期**

- `selfImprovement.triggered = true`。
- 复盘失败链路。
- 指出工具调用时机错误。
- 给出 Codex brief、eval case、agent rule。
- `actions = []`。
- `actionDecision.shouldCreateActionPlan = false`。

## Case 4：Gemini 第一章提示词

**输入**

生成一份发给 Gemini 的第一章提示词。

**预期**

- 先限定第一章叙事功能。
- 避免解释完整世界观。
- 输出可直接使用的提示词。
- `actions = []`。
- `actionDecision.shouldCreateActionPlan = false`。

## Case 5：小说资料更新

**输入**

把顾慎当前位置更新为第三矿区阵眼。

**预期**

- 生成 `character_position_update` action。
- `actionDecision.shouldCreateActionPlan = true`。
- 右侧生成可确认 ActionPlan。

## Case 6：LG 行为规则记录

**输入**

把这条规则记下来：评价章节时不要自动入库。

**预期**

- 生成 `agent_rule_update` action。
- `actionDecision.shouldCreateActionPlan = true`。
- 确认后写入 `LG_DATA_DIR/agent/agent-rules.jsonl`。
