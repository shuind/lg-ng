import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { getGlobalDataRoot } from "@/lib/server/paths"
import { hashSecret } from "@/lib/server/secret-crypto"

const scrypt = promisify(crypto.scrypt)

export const SESSION_COOKIE_NAME = "lg_session"
const AUTH_FILE = "auth.json"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MIN_PASSWORD_LENGTH = 8

export type AuthUser = {
  id: string
  email: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
  updatedAt: string
}

type AuthSession = {
  id: string
  userId: string
  tokenHash: string
  createdAt: string
  expiresAt: string
}

type RedeemedInvite = {
  codeHash: string
  userId: string
  redeemedAt: string
}

type AuthDatabase = {
  users: AuthUser[]
  sessions: AuthSession[]
  redeemedInvites: RedeemedInvite[]
}

export type AuthSessionResult = {
  user: Pick<AuthUser, "id" | "email" | "createdAt">
  token: string
  expiresAt: string
}

export type AuthAdminSnapshot = {
  users: Array<Pick<AuthUser, "id" | "email" | "createdAt" | "updatedAt">>
  sessions: Array<Pick<AuthSession, "userId" | "createdAt" | "expiresAt">>
  redeemedInvites: Array<Pick<RedeemedInvite, "userId" | "redeemedAt">>
  invites: AuthInviteOverview[]
  inviteCodeCount: number
  adminEmailCount: number
}

export type AuthInviteOverview = {
  code: string | null
  codeHash: string
  configured: boolean
  redeemed: boolean
  redeemedByUserId: string | null
  redeemedByEmail: string | null
  redeemedAt: string | null
}

let authLock: Promise<void> = Promise.resolve()

function authPath(): string {
  return path.join(getGlobalDataRoot(), "auth", AUTH_FILE)
}

function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : ""
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function publicUser(user: AuthUser): AuthSessionResult["user"] {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  }
}

function normalizeDatabase(data: unknown): AuthDatabase {
  const raw = data && typeof data === "object" ? data as Partial<AuthDatabase> : {}
  return {
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    redeemedInvites: Array.isArray(raw.redeemedInvites) ? raw.redeemedInvites : [],
  }
}

async function readDatabase(): Promise<AuthDatabase> {
  try {
    const raw = await fs.readFile(authPath(), "utf8")
    return normalizeDatabase(JSON.parse(raw))
  } catch {
    return { users: [], sessions: [], redeemedInvites: [] }
  }
}

async function writeDatabase(db: AuthDatabase): Promise<void> {
  await fs.mkdir(path.dirname(authPath()), { recursive: true })
  await fs.writeFile(authPath(), `${JSON.stringify(db, null, 2)}\n`, "utf8")
}

async function withAuthLock<T>(callback: () => Promise<T>): Promise<T> {
  const previous = authLock
  let release!: () => void
  authLock = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await callback()
  } finally {
    release()
  }
}

async function hashPassword(password: string, salt = crypto.randomBytes(16).toString("base64url")) {
  const derived = await scrypt(password, salt, 64) as Buffer
  return {
    salt,
    hash: derived.toString("base64url"),
  }
}

async function verifyPassword(password: string, user: AuthUser): Promise<boolean> {
  const { hash } = await hashPassword(password, user.passwordSalt)
  const left = Buffer.from(hash)
  const right = Buffer.from(user.passwordHash)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function configuredInviteCodes(): string[] {
  const codes = (process.env.LG_INVITE_CODES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (codes.length > 0) return codes
  if (process.env.NODE_ENV !== "production") return ["dev-invite"]
  return []
}

function configuredAdminEmails(): string[] {
  return (process.env.LG_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
}

export function isAdminEmail(email: string): boolean {
  return configuredAdminEmails().includes(normalizeEmail(email))
}

function validateInviteCode(db: AuthDatabase, inviteCode: unknown): string {
  const code = typeof inviteCode === "string" ? inviteCode.trim() : ""
  const validCodes = configuredInviteCodes()
  if (validCodes.length === 0) throw new Error("invite_not_configured")
  const codeBuffer = Buffer.from(code)
  if (!code || !validCodes.some((item) => {
    const itemBuffer = Buffer.from(item)
    return itemBuffer.length === codeBuffer.length && crypto.timingSafeEqual(itemBuffer, codeBuffer)
  })) {
    throw new Error("invalid_invite")
  }

  const codeHash = hashSecret(code)
  if (db.redeemedInvites.some((invite) => invite.codeHash === codeHash)) {
    throw new Error("invite_redeemed")
  }
  return codeHash
}

export async function getAuthAdminSnapshot(): Promise<AuthAdminSnapshot> {
  return withAuthLock(async () => {
    const db = await readDatabase()
    const usersById = new Map(db.users.map((user) => [user.id, user]))
    const redeemedByCodeHash = new Map(db.redeemedInvites.map((invite) => [invite.codeHash, invite]))
    const inviteCodes = configuredInviteCodes()
    const configuredInvites = inviteCodes.map((code): AuthInviteOverview => {
      const codeHash = hashSecret(code)
      const redeemed = redeemedByCodeHash.get(codeHash)
      const user = redeemed ? usersById.get(redeemed.userId) : null
      return {
        code,
        codeHash,
        configured: true,
        redeemed: Boolean(redeemed),
        redeemedByUserId: redeemed?.userId ?? null,
        redeemedByEmail: user?.email ?? null,
        redeemedAt: redeemed?.redeemedAt ?? null,
      }
    })
    const configuredHashes = new Set(configuredInvites.map((invite) => invite.codeHash))
    const removedRedeemedInvites = db.redeemedInvites
      .filter((invite) => !configuredHashes.has(invite.codeHash))
      .map((invite): AuthInviteOverview => {
        const user = usersById.get(invite.userId)
        return {
          code: null,
          codeHash: invite.codeHash,
          configured: false,
          redeemed: true,
          redeemedByUserId: invite.userId,
          redeemedByEmail: user?.email ?? null,
          redeemedAt: invite.redeemedAt,
        }
      })

    return {
      users: db.users.map((user) => ({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      sessions: db.sessions.map((session) => ({
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })),
      redeemedInvites: db.redeemedInvites.map((invite) => ({
        userId: invite.userId,
        redeemedAt: invite.redeemedAt,
      })),
      invites: [...configuredInvites, ...removedRedeemedInvites],
      inviteCodeCount: inviteCodes.length,
      adminEmailCount: configuredAdminEmails().length,
    }
  })
}

function createToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

async function createSessionForUser(db: AuthDatabase, user: AuthUser): Promise<AuthSessionResult> {
  const now = new Date()
  const token = createToken()
  const session: AuthSession = {
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: hashSecret(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  }
  const nowMs = now.getTime()
  db.sessions = [
    ...db.sessions.filter((item) => new Date(item.expiresAt).getTime() > nowMs),
    session,
  ]
  return {
    user: publicUser(user),
    token,
    expiresAt: session.expiresAt,
  }
}

export async function registerUser(input: {
  email: unknown
  password: unknown
  inviteCode: unknown
}): Promise<AuthSessionResult> {
  const email = normalizeEmail(input.email)
  const password = typeof input.password === "string" ? input.password : ""
  if (!isValidEmail(email)) throw new Error("invalid_email")
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error("weak_password")

  return withAuthLock(async () => {
    const db = await readDatabase()
    if (db.users.some((user) => user.email === email)) throw new Error("email_exists")
    const inviteHash = validateInviteCode(db, input.inviteCode)
    const now = new Date().toISOString()
    const passwordResult = await hashPassword(password)
    const user: AuthUser = {
      id: crypto.randomUUID(),
      email,
      passwordHash: passwordResult.hash,
      passwordSalt: passwordResult.salt,
      createdAt: now,
      updatedAt: now,
    }
    db.users.push(user)
    db.redeemedInvites.push({
      codeHash: inviteHash,
      userId: user.id,
      redeemedAt: now,
    })
    const session = await createSessionForUser(db, user)
    await writeDatabase(db)
    return session
  })
}

export async function loginUser(input: {
  email: unknown
  password: unknown
}): Promise<AuthSessionResult> {
  const email = normalizeEmail(input.email)
  const password = typeof input.password === "string" ? input.password : ""
  if (!email || !password) throw new Error("invalid_credentials")

  return withAuthLock(async () => {
    const db = await readDatabase()
    const user = db.users.find((item) => item.email === email)
    if (!user || !(await verifyPassword(password, user))) {
      throw new Error("invalid_credentials")
    }
    const session = await createSessionForUser(db, user)
    await writeDatabase(db)
    return session
  })
}

export async function getUserBySessionToken(token: string | null): Promise<AuthSessionResult["user"] | null> {
  if (!token) return null
  return withAuthLock(async () => {
    const db = await readDatabase()
    const tokenHash = hashSecret(token)
    const now = Date.now()
    const session = db.sessions.find((item) =>
      item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > now
    )
    if (!session) return null
    const user = db.users.find((item) => item.id === session.userId)
    return user ? publicUser(user) : null
  })
}

export async function deleteSessionToken(token: string | null): Promise<void> {
  if (!token) return
  await withAuthLock(async () => {
    const db = await readDatabase()
    const tokenHash = hashSecret(token)
    db.sessions = db.sessions.filter((session) => session.tokenHash !== tokenHash)
    await writeDatabase(db)
  })
}

export function sessionCookieOptions(expiresAt: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  }
}
