import { type NextRequest, NextResponse } from 'next/server'

import { authWithRevocation, invalidateSessionUser, sessionUserFromRow } from '@/auth'
import { fetchUserSessionData } from '@/lib/auth-user-session'
import {
  createSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signInWithEmailPassword,
} from '@/lib/firebase/auth-server'
import { update, users } from '@/lib/fsdb'
import { logUserLogin } from '@/lib/system-activity-log'

export const dynamic = 'force-dynamic'

/** Secure cookie unless the request is plain http (VPS by IP / local dev). `AUTH_COOKIE_SECURE` overrides. */
function secureCookie(req: NextRequest): boolean {
  const explicit = process.env.AUTH_COOKIE_SECURE?.toLowerCase()
  if (explicit === 'false' || explicit === '0') return false
  if (explicit === 'true' || explicit === '1') return true
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwarded === 'http' || forwarded === 'https') return forwarded === 'https'
  return req.nextUrl.protocol === 'https:'
}

/** GET /api/auth/session — current session for the client provider (`useSession`). */
export async function GET() {
  const session = await authWithRevocation()
  return NextResponse.json(session ?? null, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST /api/auth/session — `{ email, password }` → verified by Firebase Auth → session cookie. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown }
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!email || !password) {
    return NextResponse.json({ error: 'CredentialsSignin' }, { status: 400 })
  }

  const signIn = await signInWithEmailPassword(email, password)
  if (!signIn.ok) {
    if (signIn.code === 'INVALID_CREDENTIALS' || signIn.code === 'USER_DISABLED') {
      return NextResponse.json({ error: 'CredentialsSignin' }, { status: 401 })
    }
    if (signIn.code === 'TOO_MANY_ATTEMPTS') {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    }
    console.error('[auth/session] sign-in failed:', signIn.code, signIn.detail)
    return NextResponse.json({ error: 'Configuration' }, { status: 503 })
  }

  const data = await fetchUserSessionData(signIn.uid)
  if (!data.active || !data.row) {
    console.error('[auth/session] user inactive or missing in Firestore:', email)
    return NextResponse.json({ error: 'CredentialsSignin' }, { status: 401 })
  }

  let cookie: string
  try {
    cookie = await createSessionCookie(signIn.idToken)
  } catch (err) {
    console.error('[auth/session] createSessionCookie failed:', err)
    return NextResponse.json({ error: 'Configuration' }, { status: 503 })
  }

  const now = new Date()
  try {
    await update(users, data.row.id, { lastLoginAt: now, lastActiveAt: now })
    await logUserLogin({ userId: data.row.id, role: data.row.role, email: data.row.email, provider: 'password' })
  } catch (err) {
    console.error('[auth/session] login activity log failed:', err)
  }
  invalidateSessionUser(data.row.id)

  const res = NextResponse.json({
    ok: true,
    session: { user: sessionUserFromRow(data.row), expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString() },
  })
  res.cookies.set(SESSION_COOKIE_NAME, cookie, {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return res
}

/** DELETE /api/auth/session — sign out (clears the cookie). */
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
