import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { loadKeyCalls } from '@/lib/api-key-calls'
import { CALL_LOG_DAYS } from '@/lib/api-key-calls-core'
import { getAppTimeZone } from '@/lib/app-time-server'
import { isAdmin } from '@/lib/auth-utils'
import { apiKeys, get } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

/** GET /api/api-keys/[id]/calls: what a key or connection called, newest first (the last 30 days, at most 100). Admin only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  if (!(await get(apiKeys, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ time_zone: await getAppTimeZone(), days: CALL_LOG_DAYS, calls: await loadKeyCalls(id) })
}
