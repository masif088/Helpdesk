import { cookies } from 'next/headers'
import { cache } from 'react'

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
  error?: 'AccessRevoked'
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
  const jar = await cookies()
  const session = await sessionFromCookie(jar.get(SESSION_COOKIE_NAME)?.value)
  if (!session?.user) return null
  return session
})

/** Like `auth()` but also returns revoked sessions (so the client can be told to sign out). */
export async function authWithRevocation(): Promise<Session | null> {
  const jar = await cookies()
  return sessionFromCookie(jar.get(SESSION_COOKIE_NAME)?.value)
}
