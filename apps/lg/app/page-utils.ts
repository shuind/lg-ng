import type { Message, Turn } from "@/lib/types"
import type { ResponseConstraint } from "@/lib/types"

const ROOT_PARENT_KEY = "__root__"

export type TurnBranchNavigation = {
  index: number
  total: number
  previousTurnId?: string
  nextTurnId?: string
}

export type ChatThreadView = {
  activeLeafTurnId: string | null
  visibleTurns: Turn[]
  visibleMessages: Message[]
  turnBranchNavigation: Record<string, TurnBranchNavigation>
}

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [...items, item]
}

export function upsertTurnById(items: Turn[], item: Turn): Turn[] {
  const index = items.findIndex((current) => current.id === item.id)
  if (index < 0) return [...items, item]

  const merged = mergeTurnRecord(items[index]!, item)
  if (merged === items[index]) return items

  const next = [...items]
  next[index] = merged
  return next
}

export function findLatestSelectableTurnId(turns: Turn[], messages: Message[]): string | null {
  const messageTimesByTurn = latestMessageTimesByTurn(messages)
  let latestTurn: Turn | null = null
  let latestTime = Number.NEGATIVE_INFINITY
  let latestIndex = -1

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index]!
    const time = turnConversationTime(turn, messageTimesByTurn)
    if (time > latestTime || (time === latestTime && index > latestIndex)) {
      latestTurn = turn
      latestTime = time
      latestIndex = index
    }
  }

  if (latestTurn) return latestTurn.id

  return [...messages].sort((a, b) => {
    const byTime = timestampValue(a.createdAt) - timestampValue(b.createdAt)
    if (byTime !== 0) return byTime
    return a.id.localeCompare(b.id)
  }).at(-1)?.turnId ?? null
}

export function buildChatThreadView(
  turns: Turn[],
  messages: Message[],
  activeLeafTurnId: string | null,
): ChatThreadView {
  const fallbackLeafTurnId = activeLeafTurnId && turns.some((turn) => turn.id === activeLeafTurnId)
    ? activeLeafTurnId
    : findLatestSelectableTurnId(turns, messages)
  const visibleTurns = fallbackLeafTurnId ? getTurnPath(turns, fallbackLeafTurnId) : []
  const visibleTurnIds = new Set(visibleTurns.map((turn) => turn.id))
  const messagesByTurn = groupMessagesByTurn(messages)
  const visibleMessages = visibleTurns.flatMap((turn) => messagesByTurn.get(turn.id) ?? [])
  const siblingsByParent = groupTurnsByParent(turns)
  const turnBranchNavigation: Record<string, TurnBranchNavigation> = {}

  for (const turn of visibleTurns) {
    const siblings = siblingsByParent.get(parentKey(turn.parentTurnId)) ?? []
    if (siblings.length <= 1) continue

    const index = siblings.findIndex((sibling) => sibling.id === turn.id)
    if (index < 0) continue
    turnBranchNavigation[turn.id] = {
      index: index + 1,
      total: siblings.length,
      previousTurnId: siblings[index - 1]?.id,
      nextTurnId: siblings[index + 1]?.id,
    }
  }

  return {
    activeLeafTurnId: fallbackLeafTurnId && visibleTurnIds.has(fallbackLeafTurnId) ? fallbackLeafTurnId : null,
    visibleTurns,
    visibleMessages,
    turnBranchNavigation,
  }
}

export function findLatestDescendantTurnId(turns: Turn[], rootTurnId: string): string | null {
  const root = turns.find((turn) => turn.id === rootTurnId)
  if (!root) return null

  const childrenByParent = groupTurnsByParent(turns)
  const compareTurns = createTurnComparator(turns)
  const stack = [root]
  let latest = root

  while (stack.length > 0) {
    const turn = stack.pop()
    if (!turn) continue
    if (compareTurns(latest, turn) < 0) latest = turn
    stack.push(...(childrenByParent.get(parentKey(turn.id)) ?? []))
  }

  return latest.id
}

export function findTurnParentForEdit(turns: Turn[], turnId: string): string | null | undefined {
  const turn = turns.find((item) => item.id === turnId)
  if (!turn) return undefined
  return turn.parentTurnId ?? null
}

export function buildAppliedConstraints(
  constraints: ResponseConstraint[],
  enabledIds: string[],
  temporaryConstraints: string[],
): NonNullable<Message["constraints"]> {
  const enabled = new Set(enabledIds)
  return [
    ...constraints
      .filter((constraint) => enabled.has(constraint.id))
      .map((constraint) => ({
        id: constraint.id,
        title: constraint.title,
        instruction: constraint.instruction,
        source: "library" as const,
      })),
    ...temporaryConstraints
      .map((instruction, index) => ({
        title: `本轮临时约束 ${index + 1}`,
        instruction: instruction.trim(),
        source: "temporary" as const,
      }))
      .filter((constraint) => constraint.instruction),
  ]
}

function getTurnPath(turns: Turn[], leafTurnId: string): Turn[] {
  const byId = new Map(turns.map((turn) => [turn.id, turn]))
  const path: Turn[] = []
  const seen = new Set<string>()
  let cursor: string | undefined = leafTurnId

  while (cursor) {
    if (seen.has(cursor)) return []
    seen.add(cursor)
    const turn = byId.get(cursor)
    if (!turn) return []
    path.unshift(turn)
    cursor = turn.parentTurnId
  }

  return path
}

function groupTurnsByParent(turns: Turn[]): Map<string, Turn[]> {
  const compareTurns = createTurnComparator(turns)
  const byParent = new Map<string, Turn[]>()
  for (const turn of turns) {
    const key = parentKey(turn.parentTurnId)
    const bucket = byParent.get(key) ?? []
    bucket.push(turn)
    byParent.set(key, bucket)
  }
  for (const [key, bucket] of byParent.entries()) {
    byParent.set(key, [...bucket].sort(compareTurns))
  }
  return byParent
}

function groupMessagesByTurn(messages: Message[]): Map<string, Message[]> {
  const byTurn = new Map<string, Message[]>()
  for (const message of messages) {
    const bucket = byTurn.get(message.turnId) ?? []
    bucket.push(message)
    byTurn.set(message.turnId, bucket)
  }
  for (const [turnId, bucket] of byTurn.entries()) {
    byTurn.set(turnId, [...bucket].sort(compareMessagesForTurn))
  }
  return byTurn
}

function createTurnComparator(turns: Turn[]) {
  const order = new Map(turns.map((turn, index) => [turn.id, index]))
  return (a: Turn, b: Turn) => {
    const byCreatedAt = a.createdAt.localeCompare(b.createdAt)
    if (byCreatedAt !== 0) return byCreatedAt
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  }
}

function compareMessagesForTurn(a: Message, b: Message): number {
  const byRole = messageRoleOrder(a.role) - messageRoleOrder(b.role)
  if (byRole !== 0) return byRole
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt)
  if (byCreatedAt !== 0) return byCreatedAt
  return a.id.localeCompare(b.id)
}

function mergeTurnRecord(existing: Turn, incoming: Turn): Turn {
  if (incoming.status === "running" && existing.status !== "running") return existing

  if (incoming.status !== "running" && existing.status !== "running") {
    const existingTime = timestampValue(existing.updatedAt || existing.createdAt)
    const incomingTime = timestampValue(incoming.updatedAt || incoming.createdAt)
    if (incomingTime < existingTime) return existing
  }

  return { ...existing, ...incoming }
}

function latestMessageTimesByTurn(messages: Message[]): Map<string, number> {
  const times = new Map<string, number>()
  for (const message of messages) {
    const time = timestampValue(message.createdAt)
    const current = times.get(message.turnId) ?? Number.NEGATIVE_INFINITY
    if (time > current) times.set(message.turnId, time)
  }
  return times
}

function turnConversationTime(turn: Turn, messageTimesByTurn: Map<string, number>): number {
  return Math.max(
    messageTimesByTurn.get(turn.id) ?? Number.NEGATIVE_INFINITY,
    timestampValue(turn.createdAt),
    Number.isFinite(timestampValue(turn.createdAt)) ? Number.NEGATIVE_INFINITY : timestampValue(turn.updatedAt),
  )
}

function timestampValue(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}

function messageRoleOrder(role: Message["role"]): number {
  if (role === "user") return 0
  if (role === "assistant") return 1
  return 2
}

function parentKey(parentTurnId?: string): string {
  return parentTurnId ?? ROOT_PARENT_KEY
}
