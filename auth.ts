import { cookies, headers } from 'next/headers'
import { cache } from 'react'

import { bearerApiKey } from '@/lib/api-key-core'
import { apiRateLimiter, verifyApiKey } from '@/lib/api-keys'
import { SESSION_USER_CACHE_MS, sessionUserCache as userCache } from '@/lib/auth-session-cache'
import { fetchUserSessionData } from '@/lib/auth-user-session'
import { SESSION_COOKIE_NAME, verifySessionCookie } from '@/lib/firebase/auth-server'
import type { UsersRow } from '@/lib/fsdb'

export type SessionUser = {
  id: string
  email: string
  name: string
  image?: string | null
  role?: string
  mustChangePassword?: boolean
}

export type Session = {
  user?: SessionUser
  expires: string
  /** Set when the cookie is valid but the user was deactivated/deleted. Client signs out. */
  error?: 'AccessRevoked' | 'RateLimited'
  /** With error 'RateLimited': seconds until the API key may call again */
  retryAfterSeconds?: number
  /** Set when the request was made with an API key (Authorization: Bearer tk_live_...) instead of a login */
  apiKey?: { id: string; name: string }
}

export { invalidateSessionUser } from '@/lib/auth-session-cache'

export function sessionUserFromRow(row: UsersRow): SessionUser {
  const email = row.email ?? ''
  return {
    id: row.id,
    email,
    name: (row.fullName && row.fullName.trim()) || email || 'User',
    image: row.avatarUrl || null,
    role: row.role,
    mustChangePassword: row.mustChangePassword ?? false,
  }
}

async function loadUser(uid: string): Promise<{ row: UsersRow | null; active: boolean }> {
  const hit = userCache.get(uid)
  if (hit && Date.now() - hit.at < SESSION_USER_CACHE_MS) return hit
  const data = await fetchUserSessionData(uid)
  const entry = { at: Date.now(), row: data.row, active: data.active }
  userCache.set(uid, entry)
  return entry
}

/** Resolve the session for a raw Firebase session cookie value. */
export async function sessionFromCookie(cookie: string | undefined | null): Promise<Session | null> {
  if (!cookie) return null
  const uid = await verifySessionCookie(cookie)
  if (!uid) return null
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  let user: { row: UsersRow | null; active: boolean }
  try {
    user = await loadUser(uid)
  } catch (err) {
    console.error('[auth] user lookup failed:', err)
    return null
  }
  if (!user.active || !user.row) return { expires, error: 'AccessRevoked' }
  return { user: sessionUserFromRow(user.row), expires }
}

/**
 * Current session (server components, route handlers, server actions).
 * Backed by the Firebase Auth session cookie + the `users` document in Firestore.
 */
export const auth = cache(async (): Promise<Session | null> => {
  const key = bearerApiKey((await headers()).get('authorization'))
  if (key) return sessionFromApiKey(key)
  const jar = await cookies()
  const session = await sessionFromCookie(jar.get(SESSION_COOKIE_NAME)?.value)
  if (!session?.user) return null
  return session
})

const globalForCalls = globalThis as unknown as { __apiCalls?: Map<string, { at: number; result: ReturnType<typeof apiRateLimiter.hit> }> }
const countedCalls = (globalForCalls.__apiCalls ??= new Map())

/** Counts one call against the key's hourly limit; asking again for the same request (`auth()` can run several times) does not count twice. */
function countApiCall(keyId: string, limit: number, requestId: string | null) {
  if (!requestId) return apiRateLimiter.hit(keyId, limit)
  const seen = countedCalls.get(requestId)
  if (seen) return seen.result
  const result = apiRateLimiter.hit(keyId, limit)
  countedCalls.set(requestId, { at: Date.now(), result })
  if (countedCalls.size > 500) {
    for (const [id, v] of countedCalls) if (Date.now() - v.at > 60_000) countedCalls.delete(id)
  }
  return result
}

/**
 * A request with an API key acts as the key's user (their role and company decide what it sees), but only for the endpoints and
 * scope the middleware matched for this request (`x-api-scope`, set after the path allowlist check; any client-sent value is overwritten).
 * Anything unknown, revoked, expired, out of scope or not matched is simply "not signed in".
 */
async function sessionFromApiKey(rawKey: string): Promise<Session | null> {
  const scope = (await headers()).get('x-api-scope')
  if (!scope) return null
  const key = await verifyApiKey(rawKey)
  if (!key || !key.scopes.includes(scope as (typeof key.scopes)[number])) return null
  const limit = countApiCall(key.id, key.rateLimitPerHour, (await headers()).get('x-api-request'))
  if (!limit.ok) return { expires: new Date().toISOString(), error: 'RateLimited', retryAfterSeconds: limit.retryAfterSeconds }
  let user: { row: UsersRow | null; active: boolean }
  try {
    user = await loadUser(key.userId)
  } catch (err) {
    console.error('[auth] api key user lookup failed:', err)
    return null
  }
  if (!user.active || !user.row) return null
  return {
    user: sessionUserFromRow(user.row),
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    apiKey: { id: key.id, name: key.name },
  }
}

/** Like `auth()` but also returns revoked sessions (so the client can be told to sign out). */
export async function authWithRevocation(): Promise<Session | null> {
  const jar = await cookies()
  return sessionFromCookie(jar.get(SESSION_COOKIE_NAME)?.value)
}
