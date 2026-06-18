"use client"

import type { LucideIcon } from "lucide-react"
import { ListChecks } from "lucide-react"
import type { WorkflowAction } from "@/lib/types"

export interface WorkflowActionMeta {
  id: WorkflowAction
  label: string
  command: string
  description: string
  Icon: LucideIcon
}

const PLAN_WORKFLOW_ACTION: WorkflowActionMeta = {
  id: "plan",
  label: "计划",
  command: "/计划",
  description: "先产出章节或行动计划",
  Icon: ListChecks,
}

export const WORKFLOW_ACTIONS: WorkflowActionMeta[] = [
  PLAN_WORKFLOW_ACTION,
]

export function getWorkflowActionMeta(action?: WorkflowAction): WorkflowActionMeta | undefined {
  return WORKFLOW_ACTIONS.find((item) => item.id === action)
}
