import fs from "fs/promises"
import path from "path"
import type { AppliedResponseConstraint, ResponseConstraint } from "@/lib/types"
import { makeId, nowIso } from "@/lib/server/ids"
import { getBookDir } from "@/lib/server/paths"

const RESPONSE_CONSTRAINTS_FILE = "response-constraints.json"

export interface ResponseConstraintStore {
  constraints: ResponseConstraint[]
  threadEnabled: Record<string, string[]>
  updatedAt: string
}

export interface ResponseConstraintSnapshotInput {
  threadId: string
  constraintIds?: string[]
  temporaryConstraints?: AppliedResponseConstraint[]
}

const DEFAULT_CONSTRAINT_DEFINITIONS = [
  {
    id: "default-no-unsolicited-advice",
    title: "不主动追加写作建议",
    instruction: "除非用户明确要求，不要在回复末尾主动追加写作建议、下一步建议或可选方案。",
  },
  {
    id: "default-natural-restraint",
    title: "自然克制语气",
    instruction: "保持自然、克制、贴近对话的语气，不夸张、不卖弄、不使用过度热情的套话。",
  },
  {
    id: "default-no-fixed-ending-question",
    title: "不用固定结尾问句",
    instruction: "不要用固定模板式结尾问句收尾，例如“要不要我继续……”。需要收束时直接收束。",
  },
]

function constraintsPath(bookId: string): string {
  return path.join(getBookDir(bookId), RESPONSE_CONSTRAINTS_FILE)
}

function defaultConstraints(ts: string): ResponseConstraint[] {
  return DEFAULT_CONSTRAINT_DEFINITIONS.map((item) => ({
    ...item,
    createdAt: ts,
    updatedAt: ts,
  }))
}

function normalizeConstraint(value: unknown): ResponseConstraint | null {
  if (!value || typeof value !== "object") return null
  const item = value as Partial<ResponseConstraint>
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.instruction !== "string") {
    return null
  }
  const ts = nowIso()
  return {
    id: item.id,
    title: item.title.trim(),
    instruction: item.instruction.trim(),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : ts,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : ts,
  }
}

function normalizeThreadEnabled(value: unknown, validIds: Set<string>): Record<string, string[]> {
  if (!value || typeof value !== "object") return {}
  const enabled: Record<string, string[]> = {}
  for (const [threadId, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue
    enabled[threadId] = ids.filter((id): id is string => typeof id === "string" && validIds.has(id))
  }
  return enabled
}

async function writeStore(bookId: string, store: ResponseConstraintStore): Promise<ResponseConstraintStore> {
  const filePath = constraintsPath(bookId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8")
  return store
}

export async function getResponseConstraintStore(bookId: string): Promise<ResponseConstraintStore> {
  const filePath = constraintsPath(bookId)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const data = JSON.parse(raw) as Partial<ResponseConstraintStore>
    const constraints = Array.isArray(data.constraints)
      ? data.constraints.flatMap((item) => {
          const constraint = normalizeConstraint(item)
          return constraint ? [constraint] : []
        })
      : []
    const validIds = new Set(constraints.map((constraint) => constraint.id))
    return {
      constraints,
      threadEnabled: normalizeThreadEnabled(data.threadEnabled, validIds),
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : nowIso(),
    }
  } catch {
    const ts = nowIso()
    return writeStore(bookId, {
      constraints: defaultConstraints(ts),
      threadEnabled: {},
      updatedAt: ts,
    })
  }
}

export async function createResponseConstraint(
  bookId: string,
  input: Pick<ResponseConstraint, "title" | "instruction">,
): Promise<ResponseConstraintStore> {
  const store = await getResponseConstraintStore(bookId)
  const ts = nowIso()
  const constraint: ResponseConstraint = {
    id: makeId("constraint"),
    title: input.title.trim(),
    instruction: input.instruction.trim(),
    createdAt: ts,
    updatedAt: ts,
  }
  return writeStore(bookId, {
    ...store,
    constraints: [...store.constraints, constraint],
    updatedAt: ts,
  })
}

export async function updateResponseConstraint(
  bookId: string,
  id: string,
  input: Pick<ResponseConstraint, "title" | "instruction">,
): Promise<ResponseConstraintStore> {
  const store = await getResponseConstraintStore(bookId)
  const ts = nowIso()
  return writeStore(bookId, {
    ...store,
    constraints: store.constraints.map((constraint) =>
      constraint.id === id
        ? {
            ...constraint,
            title: input.title.trim(),
            instruction: input.instruction.trim(),
            updatedAt: ts,
          }
        : constraint,
    ),
    updatedAt: ts,
  })
}

export async function deleteResponseConstraint(bookId: string, id: string): Promise<ResponseConstraintStore> {
  const store = await getResponseConstraintStore(bookId)
  const ts = nowIso()
  const threadEnabled = Object.fromEntries(
    Object.entries(store.threadEnabled).map(([threadId, ids]) => [threadId, ids.filter((item) => item !== id)]),
  )
  return writeStore(bookId, {
    constraints: store.constraints.filter((constraint) => constraint.id !== id),
    threadEnabled,
    updatedAt: ts,
  })
}

export async function setThreadResponseConstraintIds(
  bookId: string,
  threadId: string,
  constraintIds: string[],
): Promise<ResponseConstraintStore> {
  const store = await getResponseConstraintStore(bookId)
  const ts = nowIso()
  const validIds = new Set(store.constraints.map((constraint) => constraint.id))
  const enabledIds = [...new Set(constraintIds.filter((id) => validIds.has(id)))]
  return writeStore(bookId, {
    ...store,
    threadEnabled: {
      ...store.threadEnabled,
      [threadId]: enabledIds,
    },
    updatedAt: ts,
  })
}

export async function resolveResponseConstraintSnapshot(
  bookId: string,
  input: ResponseConstraintSnapshotInput,
): Promise<AppliedResponseConstraint[]> {
  const store = await getResponseConstraintStore(bookId)
  const ids = input.constraintIds ?? store.threadEnabled[input.threadId] ?? []
  const selected = new Set(ids)
  const libraryConstraints: AppliedResponseConstraint[] = store.constraints
    .filter((constraint) => selected.has(constraint.id))
    .map((constraint) => ({
      id: constraint.id,
      title: constraint.title,
      instruction: constraint.instruction,
      source: "library",
    }))
  const temporaryConstraints = input.temporaryConstraints ?? []
  return [...libraryConstraints, ...temporaryConstraints]
}
