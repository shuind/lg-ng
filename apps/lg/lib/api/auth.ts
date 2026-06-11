import { readJsonResponse } from "./common"

export type AuthUser = {
  id: string
  email: string
  createdAt: string
}

export async function login(input: { email: string; password: string }): Promise<{ user: AuthUser }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<{ user: AuthUser }>(res)
}

export async function register(input: {
  email: string
  password: string
  inviteCode: string
}): Promise<{ user: AuthUser }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return readJsonResponse<{ user: AuthUser }>(res)
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST" })
  await readJsonResponse(res)
}
