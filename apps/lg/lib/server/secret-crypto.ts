import crypto from "node:crypto"

const ENCRYPTION_VERSION = "v1"
const IV_LENGTH = 12
let warnedAboutDevKey = false

function decodeConfiguredKey(value: string): Buffer {
  const trimmed = value.trim()
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex")

  try {
    const decoded = Buffer.from(trimmed, "base64")
    if (decoded.length === 32) return decoded
  } catch {
    // Fall through to derived key.
  }

  return crypto.createHash("sha256").update(trimmed).digest()
}

function getEncryptionKey(): Buffer {
  const configured = process.env.APP_ENCRYPTION_KEY
  if (configured) return decodeConfiguredKey(configured)

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_ENCRYPTION_KEY is required in production")
  }

  if (!warnedAboutDevKey) {
    warnedAboutDevKey = true
    console.warn("[secret-crypto] APP_ENCRYPTION_KEY is not set; using a development-only key.")
  }
  return crypto.createHash("sha256").update("lg-ng-development-encryption-key").digest()
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":")
}

export function decryptSecret(value: string): string {
  const [version, ivText, tagText, ciphertextText] = value.split(":")
  if (version !== ENCRYPTION_VERSION || !ivText || !tagText || !ciphertextText) {
    throw new Error("unsupported encrypted secret")
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tagText, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

export function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const tail = trimmed.slice(-4)
  return `•••• ${tail}`
}
