import type { Message, Turn } from "@/lib/mock-data"
import type { ResponseConstraint } from "@/lib/types"

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [...items, item]
}

export function findLatestSelectableTurnId(turns: Turn[], messages: Message[]): string | null {
  const latestDoneTurn = [...turns].reverse().find((turn) => turn.status === "done")
  if (latestDoneTurn) return latestDoneTurn.id
  return messages.at(-1)?.turnId ?? null
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
