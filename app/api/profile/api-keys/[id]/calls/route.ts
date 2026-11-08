import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { loadKeyCalls } from '@/lib/api-key-calls'
import { CALL_LOG_DAYS } from '@/lib/api-key-calls-core'
import { getAppTimeZone } from '@/lib/app-time-server'
import { apiKeys, get } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

/** GET /api/profile/api-keys/[id]/calls: what one of your own keys or connections called, newest first. Someone else's key answers 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  // A key can never read key logs
  if (!session?.user?.id || session.apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const key = await get(apiKeys, id)
  if (!key || key.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ time_zone: await getAppTimeZone(), days: CALL_LOG_DAYS, calls: await loadKeyCalls(id) })
}
