import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { revokeApiKey, setApiKeyRateLimit } from '@/lib/api-keys'
import { isAdmin } from '@/lib/auth-utils'

/** PATCH /api/api-keys/[id] { rate_limit_per_hour }: change how many calls per hour the key may make. Admin only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { rate_limit_per_hour?: unknown }
  if (typeof body.rate_limit_per_hour !== 'number' || body.rate_limit_per_hour < 1) {
    return NextResponse.json({ error: 'rate_limit_per_hour must be a number of 1 or more' }, { status: 400 })
  }
  const ok = await setApiKeyRateLimit(id, body.rate_limit_per_hour)
  return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

/** DELETE /api/api-keys/[id]: revoke a key (it stops working at once; the row stays for the record). Admin only. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const ok = await revokeApiKey(id)
  return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}
