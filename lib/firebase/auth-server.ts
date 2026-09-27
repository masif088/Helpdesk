import type { Auth, UserRecord } from 'firebase-admin/auth'

import { getFirebaseAdminAuth } from '@/lib/firebase/admin'

/** Session cookie issued by Firebase Auth (`createSessionCookie`). Firebase allows at most 14 days. */
export const SESSION_COOKIE_NAME = '__session'
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60

export class FirebaseAuthNotConfiguredError extends Error {
  constructor() {
    super('Firebase Auth is not configured (Firebase Admin credentials and NEXT_PUBLIC_FIREBASE_API_KEY are required)')
    this.name = 'FirebaseAuthNotConfiguredError'
  }
}

export function adminAuth(): Auth {
  const a = getFirebaseAdminAuth()
  if (!a) throw new FirebaseAuthNotConfiguredError()
  return a
}

function identityToolkitBase(): string {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim()
  return emulator
    ? `http://${emulator}/identitytoolkit.googleapis.com/v1`
    : 'https://identitytoolkit.googleapis.com/v1'
}

export type PasswordSignInResult =
  | { ok: true; uid: string; idToken: string }
  | { ok: false; code: 'INVALID_CREDENTIALS' | 'USER_DISABLED' | 'TOO_MANY_ATTEMPTS' | 'NOT_CONFIGURED' | 'UNKNOWN'; detail?: string }

/**
 * Verify email + password against Firebase Auth (Identity Toolkit REST, same call the client SDK makes).
 * Server-side so login, change-password and "verify current password" share one path.
 */
export async function signInWithEmailPassword(email: string, password: string): Promise<PasswordSignInResult> {
  const apiKey = process.env.FIREBASE_API_KEY?.trim() || process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
  if (!apiKey) return { ok: false, code: 'NOT_CONFIGURED', detail: 'NEXT_PUBLIC_FIREBASE_API_KEY is not set' }

  let res: Response
  try {
    res = await fetch(`${identityToolkitBase()}/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: 'no-store',
    })
  } catch (err) {
    return { ok: false, code: 'UNKNOWN', detail: err instanceof Error ? err.message : String(err) }
  }

  const data = (await res.json().catch(() => ({}))) as {
    idToken?: string
    localId?: string
    error?: { message?: string }
  }
  if (res.ok && data.idToken && data.localId) {
    return { ok: true, uid: data.localId, idToken: data.idToken }
  }
  const msg = data.error?.message ?? ''
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|MISSING_PASSWORD/.test(msg)) {
    return { ok: false, code: 'INVALID_CREDENTIALS' }
  }
  if (/USER_DISABLED/.test(msg)) return { ok: false, code: 'USER_DISABLED' }
  if (/TOO_MANY_ATTEMPTS/.test(msg)) return { ok: false, code: 'TOO_MANY_ATTEMPTS' }
  if (/API_KEY|CONFIGURATION_NOT_FOUND|OPERATION_NOT_ALLOWED/.test(msg)) return { ok: false, code: 'NOT_CONFIGURED', detail: msg }
  return { ok: false, code: 'UNKNOWN', detail: msg || `HTTP ${res.status}` }
}

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
}

/** Returns the uid for a valid session cookie, or null. */
export async function verifySessionCookie(cookie: string, checkRevoked = false): Promise<string | null> {
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, checkRevoked)
    return decoded.uid
  } catch {
    return null
  }
}

function isUserNotFound(err: unknown): boolean {
  return (err as { code?: string })?.code === 'auth/user-not-found'
}

/** Create the Firebase Auth account for an app user (uid = users.id). */
export async function createAuthUser(params: {
  uid: string
  email: string
  password?: string | null
  displayName?: string | null
  disabled?: boolean
}): Promise<UserRecord> {
  return adminAuth().createUser({
    uid: params.uid,
    email: params.email.trim().toLowerCase(),
    ...(params.password ? { password: params.password } : {}),
    ...(params.displayName ? { displayName: params.displayName } : {}),
    disabled: params.disabled ?? false,
  })
}

/** Set a user's password; creates the Auth account when it does not exist yet. */
export async function setAuthUserPassword(uid: string, email: string, password: string): Promise<void> {
  try {
    await adminAuth().updateUser(uid, { password })
  } catch (err) {
    if (!isUserNotFound(err)) throw err
    await createAuthUser({ uid, email, password })
  }
}

/** Keep the Auth account in sync with the users row (email / name / active). Missing accounts are ignored. */
export async function syncAuthUser(
  uid: string,
  patch: { email?: string | null; displayName?: string | null; disabled?: boolean }
): Promise<void> {
  const update: { email?: string; displayName?: string | null; disabled?: boolean } = {}
  if (patch.email) update.email = patch.email.trim().toLowerCase()
  if (patch.displayName !== undefined) update.displayName = patch.displayName || null
  if (patch.disabled !== undefined) update.disabled = patch.disabled
  if (Object.keys(update).length === 0) return
  try {
    await adminAuth().updateUser(uid, update)
    if (patch.disabled) await adminAuth().revokeRefreshTokens(uid)
  } catch (err) {
    if (!isUserNotFound(err)) throw err
  }
}

export async function deleteAuthUser(uid: string): Promise<void> {
  try {
    await adminAuth().deleteUser(uid)
  } catch (err) {
    if (!isUserNotFound(err)) throw err
  }
}

/** Invalidate every session of a user (e.g. after password change or deactivation). */
export async function revokeAuthSessions(uid: string): Promise<void> {
  try {
    await adminAuth().revokeRefreshTokens(uid)
  } catch (err) {
    if (!isUserNotFound(err)) throw err
  }
}
