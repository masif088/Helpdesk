'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { Session } from '@/auth'

export type { Session, SessionUser } from '@/auth'

type Status = 'loading' | 'authenticated' | 'unauthenticated'

type SessionContextValue = {
  data: Session | null
  status: Status
  /** Re-read the session from the server (after profile edits etc.). The argument is ignored (kept for call-site compatibility). */
  update: (data?: unknown) => Promise<Session | null>
}

const SessionContext = createContext<SessionContextValue | null>(null)

async function fetchSession(): Promise<Session | null> {
  const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) return null
  return ((await res.json()) as Session | null) ?? null
}

function statusOf(s: Session | null): Status {
  return s?.user || s?.error ? 'authenticated' : 'unauthenticated'
}

/** Client session state, seeded from the server-rendered session and refreshed on window focus. */
export function SessionProvider({
  session,
  refetchOnWindowFocus = true,
  children,
}: {
  session?: Session | null
  refetchOnWindowFocus?: boolean
  children: React.ReactNode
}) {
  const [data, setData] = useState<Session | null>(session ?? null)
  const [status, setStatus] = useState<Status>(session === undefined ? 'loading' : statusOf(session ?? null))
  const lastFetch = useRef(0)

  const update = useCallback(async () => {
    lastFetch.current = Date.now()
    try {
      const next = await fetchSession()
      setData(next)
      setStatus(statusOf(next))
      return next
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (session === undefined) void update()
  }, [session, update])

  useEffect(() => {
    if (!refetchOnWindowFocus) return
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetch.current < 60_000) return
      void update()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [refetchOnWindowFocus, update])

  const value = useMemo(() => ({ data, status, update }), [data, status, update])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

export type SignInResult = { ok: boolean; error?: string; status: number }

/** Email + password sign-in (verified by Firebase Auth on the server, which sets the session cookie). */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return res.ok ? { ok: true, status: res.status } : { ok: false, error: body.error ?? 'CredentialsSignin', status: res.status }
}

/** Clear the session cookie and the Firebase client user; then navigate unless `redirect: false`. */
export async function signOut(opts: { callbackUrl?: string; redirect?: boolean } = {}): Promise<void> {
  try {
    await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' })
  } catch {
    // ignore — cookie may already be gone
  }
  try {
    const [{ getAuth, signOut: fbSignOut }, { getFirebaseApp }] = await Promise.all([
      import('firebase/auth'),
      import('@/lib/firebase/client'),
    ])
    const app = getFirebaseApp()
    if (app) await fbSignOut(getAuth(app))
  } catch {
    // Firebase client not configured
  }
  if (opts.redirect !== false) window.location.href = opts.callbackUrl ?? '/login'
}
