import { type NextRequest, NextResponse } from 'next/server'

/** Must match SESSION_COOKIE_NAME in lib/firebase/auth-server.ts (not imported: keeps firebase-admin out of Edge). */
const SESSION_COOKIE_NAME = '__session'

/**
 * Edge-only redirect helper. It only decodes the Firebase session cookie's expiry — the signature is
 * verified server-side by `auth()` (firebase-admin cannot run on Edge). Also forwards the pathname
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

export async function middleware(req: NextRequest) {
  const isLoggedIn = sessionCookieLooksValid(req.cookies.get(SESSION_COOKIE_NAME)?.value)
  const { pathname } = req.nextUrl

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
