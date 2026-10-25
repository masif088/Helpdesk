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
import { apiKeys, type ApiKeysRow, find, findOneBy, get, insert, update } from '@/lib/fsdb'

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
}): Promise<{ key: string; info: ApiKeyInfo }> {
  const key = generateApiKey()
  const row = await insert(apiKeys, {
    name: params.name.trim().slice(0, 80),
    prefix: keyPreview(key),
    keyHash: hashApiKey(key),
    userId: params.userId,
    scopes: normalizeScopes(params.scopes),
    rateLimitPerHour: normalizeRateLimit(params.rateLimitPerHour),
    createdBy: params.createdBy,
    expiresAt: params.expiresAt,
  })
  return { key, info: toInfo(row) }
}

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const rows = await find(apiKeys, { orderBy: [['createdAt', 'desc']] })
  return rows.map(toInfo)
}

/** Change how many calls per hour a key may make. */
export async function setApiKeyRateLimit(id: string, limit: unknown): Promise<boolean> {
  const row = await get(apiKeys, id)
  if (!row) return false
  await update(apiKeys, id, { rateLimitPerHour: normalizeRateLimit(limit), updatedAt: new Date() })
  keyCache.clear()
  return true
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const row = await get(apiKeys, id)
  if (!row) return false
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
