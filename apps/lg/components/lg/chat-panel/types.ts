import type { SettingCard } from "@/lib/mock-data"
import type { WorkflowAction } from "@/lib/types"

export type ChatCitation = SettingCard
export type ChatSendOptions = {
  constraintIds: string[]
  temporaryConstraints: string[]
  skillIds: string[]
  readonlyOnly?: boolean
  workflowAction?: WorkflowAction
  signal?: AbortSignal
}
