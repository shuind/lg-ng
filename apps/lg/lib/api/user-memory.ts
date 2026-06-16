import type { UserMemoryCandidate, UserMemoryItem, UserMemoryStore, UserMemoryUsageSnapshot } from "../types"
import { readJsonResponse } from "./common"

export interface UserMemoryPayload {
  store: UserMemoryStore
  applicable: UserMemoryUsageSnapshot[]
  candidates: UserMemoryCandidate[]
}

export async function getUserMemory(bookId?: string): Promise<UserMemoryPayload> {
  const params = new URLSearchParams()
  if (bookId) params.set("bookId", bookId)
  const query = params.toString()
  const res = await fetch(`/api/user-memory${query ? `?${query}` : ""}`, { cache: "no-store" })
  return readJsonResponse<UserMemoryPayload>(res)
}

export async function createUserMemory(input: {
  text: string
  scope: UserMemoryItem["scope"]
  bookId?: string
  tags?: string[]
  enabled?: boolean
}): Promise<UserMemoryPayload> {
  const res = await fetch("/api/user-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<UserMemoryPayload>(res)
}

export async function updateUserMemory(input: {
  id?: string
  text?: string
  enabled?: boolean
  scope?: UserMemoryItem["scope"]
  bookId?: string
  tags?: string[]
}): Promise<UserMemoryPayload> {
  const res = await fetch("/api/user-memory", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<UserMemoryPayload>(res)
}

export async function deleteUserMemory(id: string, bookId?: string): Promise<UserMemoryPayload> {
  const params = new URLSearchParams({ id })
  if (bookId) params.set("bookId", bookId)
  const res = await fetch(`/api/user-memory?${params.toString()}`, { method: "DELETE" })
  return readJsonResponse<UserMemoryPayload>(res)
}

export async function extractUserMemory(bookId: string, threadId: string): Promise<UserMemoryPayload> {
  const res = await fetch("/api/user-memory/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, threadId }),
  })
  return readJsonResponse<UserMemoryPayload>(res)
}

export async function updateUserMemoryCandidate(input: {
  id: string
  action?: "update" | "accept"
  text?: string
  reason?: string
  scope?: UserMemoryCandidate["scope"]
  bookId?: string
  tags?: string[]
}): Promise<UserMemoryPayload> {
  const res = await fetch("/api/user-memory/candidates", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<UserMemoryPayload>(res)
}

export async function deleteUserMemoryCandidate(id: string, bookId?: string): Promise<UserMemoryPayload> {
  const params = new URLSearchParams({ id })
  if (bookId) params.set("bookId", bookId)
  const res = await fetch(`/api/user-memory/candidates?${params.toString()}`, { method: "DELETE" })
  return readJsonResponse<UserMemoryPayload>(res)
}
