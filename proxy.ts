import { type NextRequest, NextResponse } from 'next/server'

import { bearerApiKey, scopeForRequest } from '@/lib/api-key-core'

/** Must match SESSION_COOKIE_NAME in lib/firebase/auth-server.ts (not imported: keeps firebase-admin out of Edge). */
const SESSION_COOKIE_NAME = '__session'

/**
 * Redirect helper. It only decodes the Firebase session cookie's expiry — the signature is
 * verified server-side by `auth()` (keeps firebase-admin out of the proxy bundle). Also forwards the pathname
 * so the (auth) layout can enforce "must change password".
 */
function sessionCookieLooksValid(value: string | undefined): boolean {
  if (!value) return false
  const parts = value.split('.')
  if (parts.length !== 3) return false
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

/**
 * API keys (Authorization: Bearer tk_live_...) may only call a short list of ticket endpoints. The matched scope is handed to `auth()`
 * in `x-api-scope`; the header is always dropped from incoming requests first so a client cannot set it.
 */
function apiRequest(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.delete('x-api-scope')
  headers.delete('x-api-request')
  const key = bearerApiKey(req.headers.get('authorization'))
  if (key) {
    const scope = scopeForRequest(req.method, req.nextUrl.pathname)
    if (!scope) return NextResponse.json({ error: 'This endpoint is not available to API keys' }, { status: 403 })
    headers.set('x-api-scope', scope)
    headers.set('x-api-request', crypto.randomUUID()) // one rate-limit count per request, however often `auth()` runs
  }
  return NextResponse.next({ request: { headers } })
}

export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) return apiRequest(req)

  const isLoggedIn = sessionCookieLooksValid(req.cookies.get(SESSION_COOKIE_NAME)?.value)
  const { pathname } = req.nextUrl

  // The app sent the visitor here because the session cookie belongs to no user (deleted account, new database): show the
  // login page and drop the cookie, instead of bouncing back to the dashboard and round again forever.
  if (pathname === '/login' && req.nextUrl.searchParams.has('reason')) {
    const res = NextResponse.next()
    res.cookies.delete(SESSION_COOKIE_NAME)
    return res
  }

  if (pathname === '/login' && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  if (pathname !== '/login' && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const headers = new Headers(req.headers)
  headers.set('x-pathname', pathname)
  return NextResponse.next({ request: { headers } })
}

/** Only pages that need auth redirects (the (auth) route group + /login). */
export const config = {
  matcher: [
    '/api/:path*',
    '/login',
    '/dashboard/:path*',
    '/tickets/:path*',
    '/settings/:path*',
    '/change-password',
    '/companies/:path*',
    '/contacts/:path*',
    '/crawl-sessions/:path*',
    '/my-company/:path*',
    '/profile/:path*',
    '/reference/:path*',
    '/reports/:path*',
    '/invoices/:path*',
    '/screenshots/:path*',
    '/ticket-activity/:path*',
  ],
}
