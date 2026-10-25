import { NextResponse } from 'next/server'

import { needsSetup, runSetup, SetupError, setupTokenRequired } from '@/lib/setup'

export const dynamic = 'force-dynamic'

/** GET /api/setup - does the app still need its first-run setup? (public) */
export async function GET() {
  const needed = await needsSetup()
  return NextResponse.json({ needsSetup: needed, tokenRequired: needed && setupTokenRequired() })
}

/**
 * POST /api/setup { appName, name, email, password, token? }
 * Public, but only works while the database has no users: creates the starting data and the first admin.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const { email } = await runSetup(body)
    return NextResponse.json({ ok: true, email })
  } catch (e) {
    if (e instanceof SetupError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[setup]', e)
    return NextResponse.json({ error: 'Setup failed. Check the server log.' }, { status: 500 })
  }
}
