import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { unauthorizedResponse } from '@/lib/api-key-http'
import { getAppTimeZone } from '@/lib/app-time-server'
import { isInternalUser } from '@/lib/auth-utils'
import { calendarViewer } from '@/lib/calendar'
import { loadPeopleActivity } from '@/lib/people-activity'
import { MAX_MY_WORKING_DAYS, parseMyWorkingQuery } from '@/lib/people-activity-core'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me/working?from=2026-11-08T09:00:00Z&to=2026-11-08T17:00:00Z: what the signed-in team member worked on in a period of at
 * most 30 days (default: today). `from` / `to` are dates (whole days) or exact moments, read in the app time zone. Only the caller's
 * own work: time entries (start, end, ticket), the tickets worked on, per hour or per day, open tickets and meetings. Login only
 * (an API key cannot call it), and not for client contacts.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorizedResponse(session)
  const user = session.user as { id: string; role?: string | null }
  if (!isInternalUser(user.role ?? undefined)) return NextResponse.json({ error: 'Only team members have working time' }, { status: 403 })

  const query = parseMyWorkingQuery(new URL(request.url).searchParams, user.id, new Date(), await getAppTimeZone())
  if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 })

  const result = await loadPeopleActivity(query, await calendarViewer(user), new Date(), { maxTickets: 200 })
  return NextResponse.json({
    from: result.from,
    to: result.to,
    time_zone: result.time_zone,
    breakdown: query.breakdown,
    max_days: MAX_MY_WORKING_DAYS,
    holidays: result.holidays,
    me: result.agents[0] ?? null,
  })
}
