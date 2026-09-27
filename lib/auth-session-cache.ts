import type { UsersRow } from '@/lib/fsdb'

/** Per-instance cache of the users row behind a session (so every request does not re-read Firestore). */
export const SESSION_USER_CACHE_MS = 30_000

type Entry = { at: number; row: UsersRow | null; active: boolean }

const globalForAuth = globalThis as typeof globalThis & {
  __deskteamSessionUserCache?: Map<string, Entry>
}

export const sessionUserCache: Map<string, Entry> = (globalForAuth.__deskteamSessionUserCache ??= new Map())

/** Drop the cached users row so the next `auth()` reflects profile/role/status edits immediately. */
export function invalidateSessionUser(userId: string): void {
  sessionUserCache.delete(userId)
}
