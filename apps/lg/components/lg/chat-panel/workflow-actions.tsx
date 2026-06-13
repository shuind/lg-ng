"use client"

import type { LucideIcon } from "lucide-react"
import { CheckCheck, Lightbulb, ListChecks, MapPin, PenLine, RefreshCw } from "lucide-react"
import type { WorkflowAction } from "@/lib/types"

export interface WorkflowActionMeta {
  id: WorkflowAction
  label: string
  command: string
  description: string
  Icon: LucideIcon
}

export const WORKFLOW_ACTIONS: WorkflowActionMeta[] = [
  {
    id: "continue",
    label: "续写",
    command: "/续写",
    description: "基于当前上下文生成可采纳的续写改动提案",
    Icon: RefreshCw,
  },
  {
    id: "revise",
    label: "改稿",
    command: "/改稿",
    description: "对已有正文或设定生成局部改动提案",
    Icon: PenLine,
  },
  {
    id: "plant",
    label: "铺垫",
    command: "/铺垫",
    description: "新增伏笔并维护相关项目状态",
    Icon: MapPin,
  },
  {
    id: "resolve",
    label: "收线",
    command: "/收线",
    description: "检查并兑现已有伏笔",
    Icon: CheckCheck,
  },
  {
    id: "diagnose",
    label: "卡点诊断",
    command: "/卡点诊断",
    description: "只读分析卡点并给出推进方向",
    Icon: Lightbulb,
  },
  {
    id: "plan",
    label: "计划",
    command: "/计划",
    description: "先产出章节或行动计划",
    Icon: ListChecks,
  },
]

export function getWorkflowActionMeta(action?: WorkflowAction): WorkflowActionMeta | undefined {
  return WORKFLOW_ACTIONS.find((item) => item.id === action)
}
