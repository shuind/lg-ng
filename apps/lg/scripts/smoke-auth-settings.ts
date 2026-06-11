import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

async function main() {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lg-auth-settings-"))
  process.env.LG_DATA_DIR = dataRoot
  process.env.APP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  process.env.LG_INVITE_CODES = "unit-code"

  const { registerUser, loginUser, getUserBySessionToken, deleteSessionToken } = await import("@/lib/server/auth-store")
  const { runWithRequestContext } = await import("@/lib/server/request-context")
  const { decryptSecret, encryptSecret, maskSecret } = await import("@/lib/server/secret-crypto")
  const { getDataRoot } = await import("@/lib/server/paths")

  try {
    const registered = await registerUser({
      email: "unit@example.com",
      password: "password123",
      inviteCode: "unit-code",
    })
    assert.equal(registered.user.email, "unit@example.com")
    assert.ok(registered.token)

    await assert.rejects(
      () => registerUser({ email: "other@example.com", password: "password123", inviteCode: "unit-code" }),
      /invite_redeemed/,
    )

    const loggedIn = await loginUser({ email: "unit@example.com", password: "password123" })
    assert.equal((await getUserBySessionToken(loggedIn.token))?.id, registered.user.id)
    await deleteSessionToken(loggedIn.token)
    assert.equal(await getUserBySessionToken(loggedIn.token), null)

    await runWithRequestContext({ userId: registered.user.id }, async () => {
      assert.equal(getDataRoot(), path.join(dataRoot, "users", registered.user.id))

      const encrypted = encryptSecret("sk-unit-secret-1234")
      assert.equal(encrypted.includes("sk-unit-secret-1234"), false)
      assert.equal(decryptSecret(encrypted), "sk-unit-secret-1234")
      assert.equal(maskSecret("sk-unit-secret-1234"), "•••• 1234")
    })
  } finally {
    await fs.rm(dataRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
