import { get, users, type UsersRow } from '@/lib/fsdb'

/** Active login + session refresh: user must exist, not soft-deleted, status active. */
export function userRowAllowsSession(row: { status: string | null; deletedAt: Date | null } | null | undefined): boolean {
  if (!row) return false
  if (row.deletedAt != null) return false
  const s = (row.status ?? 'active').toLowerCase()
  return s === 'active'
}

/** Session gate: false when the user row is missing, soft-deleted or not active. */
export async function fetchUserSessionEligibility(userId: string): Promise<boolean> {
  return userRowAllowsSession(await get(users, userId))
}

export type UserSessionData = {
  active: boolean
  row: UsersRow | null
}

/** One read for the active gate + display fields (name / avatar / role / must-change-password). */
export async function fetchUserSessionData(userId: string): Promise<UserSessionData> {
  const row = await get(users, userId)
  if (!row || !userRowAllowsSession(row)) return { active: false, row: null }
  return { active: true, row }
}
