import { createHash, randomBytes } from 'node:crypto'

import {
  API_KEY_PREFIX,
  type ApiKeyScope,
  apiKeyUsable,
  createRateLimiter,
  keyPreview,
  normalizeRateLimit,
  normalizeScopes,
} from '@/lib/api-key-core'
import { apiKeys, type ApiKeysRow, find, findBy, findOneBy, get, insert, sortRows, update } from '@/lib/fsdb'

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** A new key: "tk_live_" + 32 random bytes (base64url). The caller shows it once; only the hash is stored. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString('base64url')
}

export type ApiKeyInfo = {
  id: string
  name: string
  prefix: string
  userId: string
  scopes: ApiKeyScope[]
  rateLimitPerHour: number
  expiresAt: Date | null
  revokedAt: Date | null
  lastUsedAt: Date | null
  createdAt: Date
  createdBy: string | null
}

function toInfo(row: ApiKeysRow): ApiKeyInfo {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    userId: row.userId,
    scopes: normalizeScopes(row.scopes),
    rateLimitPerHour: normalizeRateLimit(row.rateLimitPerHour),
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    createdBy: row.createdBy ?? null,
  }
}

export async function createApiKey(params: {
  name: string
  userId: string
  scopes: unknown
  rateLimitPerHour?: unknown
  expiresAt: Date | null
  createdBy: string
  /** 'oauth' for the key behind an AI connector sign-in */
  kind?: 'oauth'
}): Promise<{ key: string; info: ApiKeyInfo }> {
  const key = generateApiKey()
  const row = await insert(apiKeys, {
    name: params.name.trim().slice(0, 80),
    prefix: keyPreview(key),
    keyHash: hashApiKey(key),
    userId: params.userId,
    scopes: normalizeScopes(params.scopes),
    rateLimitPerHour: normalizeRateLimit(params.rateLimitPerHour),
    kind: params.kind ?? null,
    createdBy: params.createdBy,
    expiresAt: params.expiresAt,
  })
  return { key, info: toInfo(row) }
}

/** Every key, or only the ones that act as `userId`. */
export async function listApiKeys(userId?: string): Promise<ApiKeyInfo[]> {
  // Filter and order in memory: a where on userId plus an orderBy would need a composite index
  const rows = userId ? await findBy(apiKeys, { userId }) : await find(apiKeys)
  return sortRows(rows, [['createdAt', 'desc']]).map(toInfo)
}

/** How many keys of this user can still be used (a person may only hold a few at a time). */
export async function countActiveApiKeys(userId: string): Promise<number> {
  // Connections made by an AI connector sign-in do not count: they are not keys the person pasted anywhere
  const rows = await findBy(apiKeys, { userId })
  return rows.filter((k) => k.kind !== 'oauth' && apiKeyUsable(k)).length
}

/** A new token for the key behind a connector sign-in (the old one stops working at once). Null when the key is gone or was revoked. */
export async function rotateApiKeyToken(id: string, expiresAt: Date): Promise<{ key: string; info: ApiKeyInfo } | null> {
  const row = await get(apiKeys, id)
  if (!row || row.revokedAt || row.kind !== 'oauth') return null
  const key = generateApiKey()
  const updated = await update(apiKeys, id, { keyHash: hashApiKey(key), prefix: keyPreview(key), expiresAt, updatedAt: new Date() })
  keyCache.clear()
  return { key, info: toInfo(updated ?? { ...row, keyHash: hashApiKey(key), prefix: keyPreview(key), expiresAt }) }
}

/** Change how many calls per hour a key may make. */
export async function setApiKeyRateLimit(id: string, limit: unknown): Promise<boolean> {
  const row = await get(apiKeys, id)
  if (!row) return false
  await update(apiKeys, id, { rateLimitPerHour: normalizeRateLimit(limit), updatedAt: new Date() })
  keyCache.clear()
  return true
}

/** Revoke a key. With `ownerId` only a key that acts as that user can be revoked (false otherwise, as if it did not exist). */
export async function revokeApiKey(id: string, ownerId?: string): Promise<boolean> {
  const row = await get(apiKeys, id)
  if (!row || (ownerId && row.userId !== ownerId)) return false
  if (!row.revokedAt) await update(apiKeys, id, { revokedAt: new Date(), updatedAt: new Date() })
  keyCache.clear()
  return true
}

// Looked up on every API call; a short cache keeps that to one read per key every 30 seconds.
const CACHE_MS = 30_000
const keyCache = new Map<string, { at: number; row: ApiKeysRow | null }>()
const TOUCH_MS = 10 * 60_000
const lastTouch = new Map<string, number>()

export type VerifiedApiKey = { id: string; name: string; userId: string; scopes: ApiKeyScope[]; rateLimitPerHour: number }

// One counter for the whole process, even when the bundler loads this file more than once.
const globalForLimiter = globalThis as unknown as { __apiKeyLimiter?: ReturnType<typeof createRateLimiter> }
export const apiRateLimiter = (globalForLimiter.__apiKeyLimiter ??= createRateLimiter())

/** The key behind a raw "tk_live_..." string, or null when unknown, revoked or expired. */
export async function verifyApiKey(key: string): Promise<VerifiedApiKey | null> {
  const hash = hashApiKey(key)
  const hit = keyCache.get(hash)
  let row: ApiKeysRow | null
  if (hit && Date.now() - hit.at < CACHE_MS) {
    row = hit.row
  } else {
    row = (await findOneBy(apiKeys, { keyHash: hash })) ?? null
    keyCache.set(hash, { at: Date.now(), row })
  }
  if (!row || !apiKeyUsable(row)) return null

  const last = lastTouch.get(row.id) ?? 0
  if (Date.now() - last > TOUCH_MS) {
    lastTouch.set(row.id, Date.now())
    void update(apiKeys, row.id, { lastUsedAt: new Date() }).catch(() => undefined)
  }
  return { id: row.id, name: row.name, userId: row.userId, scopes: normalizeScopes(row.scopes), rateLimitPerHour: normalizeRateLimit(row.rateLimitPerHour) }
}
