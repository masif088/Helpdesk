import { randomBytes, randomUUID } from 'node:crypto'

import { invalidateSessionUser } from '@/lib/auth-session-cache'
import { createAuthUser, revokeAuthSessions, setAuthUserPassword, syncAuthUser } from '@/lib/firebase/auth-server'
import { findOne, insert, type NewUsersRow, remove, update, users, type UsersRow } from '@/lib/fsdb'

/** Random password for accounts that are created on someone's behalf (email contacts, CC users). */
export function randomPassword(length = 24): string {
  return randomBytes(length).toString('base64url').slice(0, length)
}

/** Case-insensitive lookup by email (uses the stored `emailLower`). */
export async function findUserByEmail(email: string | null | undefined): Promise<UsersRow | null> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return null
  return findOne(users, { where: [['emailLower', '==', e]] })
}

/**
 * Create a user: Firestore `users` document + Firebase Auth account (uid = users.id).
 * When no password is given a random one is set (the user can reset it later).
 * If the Auth account cannot be created the Firestore row is rolled back.
 */
export async function createAppUser(data: NewUsersRow & { password?: string | null }): Promise<UsersRow> {
  const { password, ...row } = data
  const id = row.id ?? randomUUID()
  const email = row.email.trim().toLowerCase()
  const created = await insert(users, { ...row, id, email })
  try {
    await createAuthUser({
      uid: id,
      email,
      password: password || randomPassword(),
      displayName: created.fullName,
      disabled: (created.status ?? 'active') !== 'active',
    })
  } catch (err) {
    await remove(users, id).catch(() => {})
    throw err
  }
  return created
}

/** Set a new password in Firebase Auth (and optionally flag "must change on next login"). */
export async function setUserPassword(
  user: Pick<UsersRow, 'id' | 'email'>,
  password: string,
  opts: { mustChangePassword?: boolean; revokeSessions?: boolean } = {}
): Promise<void> {
  await setAuthUserPassword(user.id, user.email, password)
  if (opts.mustChangePassword !== undefined) {
    await update(users, user.id, { mustChangePassword: opts.mustChangePassword, updatedAt: new Date() })
  }
  if (opts.revokeSessions) await revokeAuthSessions(user.id)
  invalidateSessionUser(user.id)
}

/** After editing a users row: mirror email / name / active flag to Firebase Auth and drop the session cache. */
export async function afterUserRowChanged(
  before: Pick<UsersRow, 'id' | 'email' | 'fullName' | 'status' | 'deletedAt'>,
  after: Pick<UsersRow, 'id' | 'email' | 'fullName' | 'status' | 'deletedAt'>
): Promise<void> {
  const wasActive = before.status === 'active' && !before.deletedAt
  const isActive = after.status === 'active' && !after.deletedAt
  await syncAuthUser(after.id, {
    email: after.email !== before.email ? after.email : undefined,
    displayName: after.fullName !== before.fullName ? after.fullName : undefined,
    disabled: wasActive !== isActive ? !isActive : undefined,
  })
  invalidateSessionUser(after.id)
}
