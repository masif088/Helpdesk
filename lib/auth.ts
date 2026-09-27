/**
 * Auth helpers (Firebase Authentication session).
 * Use `auth()` from `@/auth` to read the session.
 */

import { auth } from '@/auth'

/** Get current user from session (server-side) */
export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

/** Require auth - throws/redirects if not logged in */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) return null
  return user
}
