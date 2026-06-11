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
const QQ_EMAIL_DOMAIN = "@qq.com"
const DEFAULT_INVITE_REDEMPTION_LIMIT = 10
const MAX_INVITE_REDEMPTION_LIMIT = 10000

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

type ManagedInviteCode = {
  id: string
  code: string
  codeHash: string
  maxRedemptions: number
  createdAt: string
  updatedAt: string
}

type AuthDatabase = {
  users: AuthUser[]
  sessions: AuthSession[]
  redeemedInvites: RedeemedInvite[]
  inviteCodes: ManagedInviteCode[]
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
  inviteSlotCount: number
  adminEmailCount: number
}

export type AuthInviteRedemptionOverview = {
  userId: string
  email: string | null
  redeemedAt: string
}

export type AuthInviteOverview = {
  code: string | null
  codeHash: string
  configured: boolean
  source: "managed" | "env" | "removed"
  editable: boolean
  redeemed: boolean
  redeemedByUserId: string | null
  redeemedByEmail: string | null
  redeemedAt: string | null
  redeemedCount: number
  maxRedemptions: number
  remainingRedemptions: number
  redeemedUsers: AuthInviteRedemptionOverview[]
  createdAt: string | null
  updatedAt: string | null
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

function isQqEmail(email: string): boolean {
  return email.endsWith(QQ_EMAIL_DOMAIN)
}

function publicUser(user: AuthUser): AuthSessionResult["user"] {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  }
}

function normalizeInviteRedemptionLimit(value: unknown, fallback = DEFAULT_INVITE_REDEMPTION_LIMIT): number {
  const limit = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(limit)) return fallback
  return Math.min(MAX_INVITE_REDEMPTION_LIMIT, Math.max(1, Math.floor(limit)))
}

function parseInviteRedemptionLimit(value: unknown, fallback = DEFAULT_INVITE_REDEMPTION_LIMIT): number {
  const limit = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_INVITE_REDEMPTION_LIMIT) {
    throw new Error("invalid_invite_limit")
  }
  return Math.floor(limit)
}

function normalizeInviteCodes(value: unknown): ManagedInviteCode[] {
  if (!Array.isArray(value)) return []
  const seenHashes = new Set<string>()
  return value.flatMap((item) => {
    const raw = item && typeof item === "object" ? item as Partial<ManagedInviteCode> : {}
    const code = typeof raw.code === "string" ? raw.code.trim() : ""
    if (!code) return []
    const codeHash = typeof raw.codeHash === "string" && raw.codeHash ? raw.codeHash : hashSecret(code)
    if (seenHashes.has(codeHash)) return []
    seenHashes.add(codeHash)
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString()
    return [{
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      code,
      codeHash,
      maxRedemptions: normalizeInviteRedemptionLimit(raw.maxRedemptions),
      createdAt,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    }]
  })
}

function normalizeDatabase(data: unknown): AuthDatabase {
  const raw = data && typeof data === "object" ? data as Partial<AuthDatabase> : {}
  return {
    users: Array.isArray(raw.users) ? raw.users : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    redeemedInvites: Array.isArray(raw.redeemedInvites) ? raw.redeemedInvites : [],
    inviteCodes: normalizeInviteCodes(raw.inviteCodes),
  }
}

async function readDatabase(): Promise<AuthDatabase> {
  try {
    const raw = await fs.readFile(authPath(), "utf8")
    return normalizeDatabase(JSON.parse(raw))
  } catch {
    return { users: [], sessions: [], redeemedInvites: [], inviteCodes: [] }
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

type InviteConfig = {
  code: string
  codeHash: string
  maxRedemptions: number
  source: AuthInviteOverview["source"]
  editable: boolean
  createdAt: string | null
  updatedAt: string | null
}

function configuredEnvInviteCodes(): string[] {
  const codes = (process.env.LG_INVITE_CODES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (codes.length > 0) return codes
  if (process.env.NODE_ENV !== "production") return ["dev-invite"]
  return []
}

function configuredInviteCodes(db: AuthDatabase): InviteConfig[] {
  const managedInvites = db.inviteCodes.map((invite): InviteConfig => ({
    code: invite.code,
    codeHash: invite.codeHash,
    maxRedemptions: invite.maxRedemptions,
    source: "managed",
    editable: true,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  }))
  const configuredHashes = new Set(managedInvites.map((invite) => invite.codeHash))
  const envInvites = configuredEnvInviteCodes()
    .map((code): InviteConfig => ({
      code,
      codeHash: hashSecret(code),
      maxRedemptions: DEFAULT_INVITE_REDEMPTION_LIMIT,
      source: "env",
      editable: false,
      createdAt: null,
      updatedAt: null,
    }))
    .filter((invite) => !configuredHashes.has(invite.codeHash))

  return [...managedInvites, ...envInvites]
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
  const validCodes = configuredInviteCodes(db)
  if (validCodes.length === 0) throw new Error("invite_not_configured")
  const codeBuffer = Buffer.from(code)
  const invite = !code ? null : validCodes.find((item) => {
    const itemBuffer = Buffer.from(item.code)
    return itemBuffer.length === codeBuffer.length && crypto.timingSafeEqual(itemBuffer, codeBuffer)
  })
  if (!invite) {
    throw new Error("invalid_invite")
  }

  const redeemedCount = db.redeemedInvites.filter((item) => item.codeHash === invite.codeHash).length
  if (redeemedCount >= invite.maxRedemptions) {
    throw new Error("invite_limit_reached")
  }
  return invite.codeHash
}

function createInviteOverview({
  code,
  codeHash,
  configured,
  source,
  editable,
  maxRedemptions,
  redemptions,
  usersById,
  createdAt,
  updatedAt,
}: {
  code: string | null
  codeHash: string
  configured: boolean
  source: AuthInviteOverview["source"]
  editable: boolean
  maxRedemptions: number
  redemptions: RedeemedInvite[]
  usersById: Map<string, AuthUser>
  createdAt: string | null
  updatedAt: string | null
}): AuthInviteOverview {
  const redeemedUsers = [...redemptions]
    .sort((left, right) => left.redeemedAt.localeCompare(right.redeemedAt))
    .map((invite) => ({
      userId: invite.userId,
      email: usersById.get(invite.userId)?.email ?? null,
      redeemedAt: invite.redeemedAt,
    }))
  const latest = redeemedUsers[redeemedUsers.length - 1] ?? null
  const remainingRedemptions = configured
    ? Math.max(0, maxRedemptions - redeemedUsers.length)
    : 0

  return {
    code,
    codeHash,
    configured,
    source,
    editable,
    redeemed: redeemedUsers.length > 0,
    redeemedByUserId: latest?.userId ?? null,
    redeemedByEmail: latest?.email ?? null,
    redeemedAt: latest?.redeemedAt ?? null,
    redeemedCount: redeemedUsers.length,
    maxRedemptions,
    remainingRedemptions,
    redeemedUsers,
    createdAt,
    updatedAt,
  }
}

function createInviteCodeValue(): string {
  return `lg-${crypto.randomBytes(12).toString("base64url")}`
}

export async function createInviteCode(input: {
  maxRedemptions?: unknown
} = {}): Promise<AuthInviteOverview> {
  const maxRedemptions = parseInviteRedemptionLimit(input.maxRedemptions)

  return withAuthLock(async () => {
    const db = await readDatabase()
    const existingHashes = new Set(configuredInviteCodes(db).map((invite) => invite.codeHash))
    let code = createInviteCodeValue()
    let codeHash = hashSecret(code)
    for (let attempt = 0; existingHashes.has(codeHash) && attempt < 5; attempt += 1) {
      code = createInviteCodeValue()
      codeHash = hashSecret(code)
    }
    if (existingHashes.has(codeHash)) throw new Error("invite_generation_failed")

    const now = new Date().toISOString()
    const invite: ManagedInviteCode = {
      id: crypto.randomUUID(),
      code,
      codeHash,
      maxRedemptions,
      createdAt: now,
      updatedAt: now,
    }
    db.inviteCodes.push(invite)
    await writeDatabase(db)

    return createInviteOverview({
      code: invite.code,
      codeHash: invite.codeHash,
      configured: true,
      source: "managed",
      editable: true,
      maxRedemptions: invite.maxRedemptions,
      redemptions: [],
      usersById: new Map(db.users.map((user) => [user.id, user])),
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
    })
  })
}

export async function updateInviteCode(input: {
  codeHash: unknown
  maxRedemptions: unknown
}): Promise<AuthInviteOverview> {
  if (typeof input.codeHash !== "string" || !input.codeHash) throw new Error("invite_not_found")
  if (input.maxRedemptions === undefined) throw new Error("invalid_invite_limit")
  const maxRedemptions = parseInviteRedemptionLimit(input.maxRedemptions)

  return withAuthLock(async () => {
    const db = await readDatabase()
    const invite = db.inviteCodes.find((item) => item.codeHash === input.codeHash)
    if (!invite) throw new Error("invite_not_found")

    invite.maxRedemptions = maxRedemptions
    invite.updatedAt = new Date().toISOString()
    await writeDatabase(db)

    return createInviteOverview({
      code: invite.code,
      codeHash: invite.codeHash,
      configured: true,
      source: "managed",
      editable: true,
      maxRedemptions: invite.maxRedemptions,
      redemptions: db.redeemedInvites.filter((item) => item.codeHash === invite.codeHash),
      usersById: new Map(db.users.map((user) => [user.id, user])),
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
    })
  })
}

export async function getAuthAdminSnapshot(): Promise<AuthAdminSnapshot> {
  return withAuthLock(async () => {
    const db = await readDatabase()
    const usersById = new Map(db.users.map((user) => [user.id, user]))
    const inviteCodes = configuredInviteCodes(db)
    const configuredInvites = inviteCodes.map((invite): AuthInviteOverview => {
      return createInviteOverview({
        code: invite.code,
        codeHash: invite.codeHash,
        configured: true,
        source: invite.source,
        editable: invite.editable,
        maxRedemptions: invite.maxRedemptions,
        redemptions: db.redeemedInvites.filter((item) => item.codeHash === invite.codeHash),
        usersById,
        createdAt: invite.createdAt,
        updatedAt: invite.updatedAt,
      })
    })
    const configuredHashes = new Set(configuredInvites.map((invite) => invite.codeHash))
    const removedInviteHashes = Array.from(new Set(
      db.redeemedInvites
        .map((invite) => invite.codeHash)
        .filter((codeHash) => !configuredHashes.has(codeHash)),
    ))
    const removedRedeemedInvites = removedInviteHashes.map((codeHash): AuthInviteOverview => (
      createInviteOverview({
        code: null,
        codeHash,
        configured: false,
        source: "removed",
        editable: false,
        maxRedemptions: db.redeemedInvites.filter((invite) => invite.codeHash === codeHash).length,
        redemptions: db.redeemedInvites.filter((invite) => invite.codeHash === codeHash),
        usersById,
        createdAt: null,
        updatedAt: null,
      })
    ))

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
      inviteSlotCount: configuredInvites.reduce((sum, invite) => sum + invite.maxRedemptions, 0),
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
  if (!isQqEmail(email)) throw new Error("qq_email_required")
  if (!password) throw new Error("invalid_password")

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
