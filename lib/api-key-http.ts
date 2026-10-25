import { NextResponse } from 'next/server'

import type { Session } from '@/auth'

/** The answer for a request without a usable login: 429 (with Retry-After) for an API key over its hourly limit, else 401. */
export function unauthorizedResponse(session: Session | null, headers?: Record<string, string>) {
  if (session?.error === 'RateLimited') {
    const retry = session.retryAfterSeconds ?? 60
    return NextResponse.json(
      { error: `Rate limit reached for this API key. Try again in ${Math.ceil(retry / 60)} minute(s).`, retry_after_seconds: retry },
      { status: 429, headers: { ...headers, 'Retry-After': String(retry) } }
    )
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
}
