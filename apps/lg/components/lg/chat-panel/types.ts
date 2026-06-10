import type { ChatReference } from "@/lib/types"
import type { WorkflowAction } from "@/lib/types"

export type ChatCitation = ChatReference
export type TurnBranchNavigation = {
  index: number
  total: number
  previousTurnId?: string
  nextTurnId?: string
}

export type ChatSendOptions = {
  constraintIds: string[]
  temporaryConstraints: string[]
  skillIds: string[]
  parentTurnId?: string | null
  readonlyOnly?: boolean
  workflowAction?: WorkflowAction
  signal?: AbortSignal
}
