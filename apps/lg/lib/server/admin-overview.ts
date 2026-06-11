import fs from "node:fs/promises"
import path from "node:path"
import { getAuthAdminSnapshot, type AuthInviteOverview } from "@/lib/server/auth-store"
import { getGlobalDataRoot } from "@/lib/server/paths"
import { getTrialQuotaSummary, type TrialQuotaSummary } from "@/lib/server/trial-quota-store"

export type AdminUserOverview = {
  id: string
  email: string
  createdAt: string
  updatedAt: string
  inviteRedeemedAt: string | null
  activeSessionCount: number
  expiredSessionCount: number
  booksCount: number
  dataBytes: number
  dataUpdatedAt: string | null
  hasPersonalDeepSeekKey: boolean
  deepSeekKeyPreview: string | null
}

export type AdminOverviewPayload = {
  generatedAt: string
  dataRoot: string
  auth: {
    userCount: number
    inviteCodeCount: number
    inviteSlotCount: number
    redeemedInviteCount: number
    activeSessionCount: number
    expiredSessionCount: number
    adminEmailCount: number
    invites: AuthInviteOverview[]
  }
  storage: {
    totalUserDataBytes: number
  }
  llm: {
    userKeyModeEnabled: boolean
    platformQuotaEnabled: boolean
  }
  quota: TrialQuotaSummary
  users: AdminUserOverview[]
}

type DirectoryStats = {
  bytes: number
  updatedAt: string | null
}

type UserAppSettingsInfo = {
  hasPersonalDeepSeekKey: boolean
  deepSeekKeyPreview: string | null
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target)
    return true
  } catch {
    return false
  }
}

async function collectDirectoryStats(target: string): Promise<DirectoryStats> {
  if (!(await pathExists(target))) return { bytes: 0, updatedAt: null }

  let bytes = 0
  let latestMtime = 0

  async function visit(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name)
      const stat = await fs.lstat(entryPath).catch(() => null)
      if (!stat) return
      latestMtime = Math.max(latestMtime, stat.mtimeMs)
      if (stat.isSymbolicLink()) return
      if (stat.isDirectory()) {
        await visit(entryPath)
        return
      }
      if (stat.isFile()) bytes += stat.size
    }))
  }

  await visit(target)
  return {
    bytes,
    updatedAt: latestMtime > 0 ? new Date(latestMtime).toISOString() : null,
  }
}

async function countBookDirectories(userRoot: string): Promise<number> {
  const booksRoot = path.join(userRoot, "books")
  const entries = await fs.readdir(booksRoot, { withFileTypes: true }).catch(() => [])
  return entries.filter((entry) => entry.isDirectory()).length
}

async function readUserAppSettings(userRoot: string): Promise<UserAppSettingsInfo> {
  try {
    const raw = await fs.readFile(path.join(userRoot, "app-settings.json"), "utf8")
    const data = JSON.parse(raw) as {
      deepSeekApiKeyEncrypted?: unknown
      deepSeekKeyPreview?: unknown
    }
    return {
      hasPersonalDeepSeekKey: typeof data.deepSeekApiKeyEncrypted === "string" && data.deepSeekApiKeyEncrypted.length > 0,
      deepSeekKeyPreview: typeof data.deepSeekKeyPreview === "string" ? data.deepSeekKeyPreview : null,
    }
  } catch {
    return {
      hasPersonalDeepSeekKey: false,
      deepSeekKeyPreview: null,
    }
  }
}

export async function getAdminOverview(): Promise<AdminOverviewPayload> {
  const [snapshot, quota] = await Promise.all([
    getAuthAdminSnapshot(),
    getTrialQuotaSummary(),
  ])
  const now = Date.now()
  const dataRoot = getGlobalDataRoot()
  const invitesByUserId = new Map(snapshot.redeemedInvites.map((invite) => [invite.userId, invite]))
  const sessionsByUserId = new Map<string, { active: number; expired: number }>()
  let activeSessionCount = 0
  let expiredSessionCount = 0

  for (const session of snapshot.sessions) {
    const current = sessionsByUserId.get(session.userId) ?? { active: 0, expired: 0 }
    if (new Date(session.expiresAt).getTime() > now) {
      current.active += 1
      activeSessionCount += 1
    } else {
      current.expired += 1
      expiredSessionCount += 1
    }
    sessionsByUserId.set(session.userId, current)
  }

  const users = await Promise.all(snapshot.users.map(async (user): Promise<AdminUserOverview> => {
    const userRoot = path.join(dataRoot, "users", user.id)
    const [stats, booksCount, appSettings] = await Promise.all([
      collectDirectoryStats(userRoot),
      countBookDirectories(userRoot),
      readUserAppSettings(userRoot),
    ])
    const sessions = sessionsByUserId.get(user.id) ?? { active: 0, expired: 0 }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      inviteRedeemedAt: invitesByUserId.get(user.id)?.redeemedAt ?? null,
      activeSessionCount: sessions.active,
      expiredSessionCount: sessions.expired,
      booksCount,
      dataBytes: stats.bytes,
      dataUpdatedAt: stats.updatedAt,
      hasPersonalDeepSeekKey: appSettings.hasPersonalDeepSeekKey,
      deepSeekKeyPreview: appSettings.deepSeekKeyPreview,
    }
  }))
  users.sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  return {
    generatedAt: new Date().toISOString(),
    dataRoot,
    auth: {
      userCount: snapshot.users.length,
      inviteCodeCount: snapshot.inviteCodeCount,
      inviteSlotCount: snapshot.inviteSlotCount,
      redeemedInviteCount: snapshot.redeemedInvites.length,
      activeSessionCount,
      expiredSessionCount,
      adminEmailCount: snapshot.adminEmailCount,
      invites: snapshot.invites,
    },
    storage: {
      totalUserDataBytes: users.reduce((sum, user) => sum + user.dataBytes, 0),
    },
    llm: {
      userKeyModeEnabled: true,
      platformQuotaEnabled: quota.enforcementEnabled,
    },
    quota,
    users,
  }
}
