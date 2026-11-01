import { after, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { unauthorizedResponse } from '@/lib/api-key-http'
import { getAppTimeZone } from '@/lib/app-time-server'
import { CalendarError, calendarViewer, createCalendarEvent, listCalendarItems, parseCalendarRange } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

/**
 * GET /api/calendar/events?from=2026-11-01&to=2026-11-30&types=meeting,leave&user_ids=me&company_ids=…&include_derived=0
 * Everything on the calendar in the range that the caller may see: stored events (repeating ones unfolded) plus ticket and
 * invoice due dates. `from` / `to` are inclusive dates (YYYY-MM-DD) or ISO moments; the default is the current month, the
 * longest range is 400 days.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorizedResponse(session)
  const url = new URL(request.url)
  const timeZone = await getAppTimeZone()
  const range = parseCalendarRange(url.searchParams.get('from'), url.searchParams.get('to'), new Date(), timeZone)
  if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })

  const viewer = await calendarViewer(session.user as { id: string; role?: string | null })
  const me = session.user.id
  const userIds = list(url.searchParams.get('user_ids')).map((u) => (u === 'me' ? me : u))
  const events = await listCalendarItems(viewer, {
    ...range,
    types: list(url.searchParams.get('types')),
    userIds,
    companyIds: list(url.searchParams.get('company_ids')),
    includeDerived: url.searchParams.get('include_derived') !== '0',
  })
  return NextResponse.json({ from: range.from.toISOString(), to: range.to.toISOString(), time_zone: timeZone, count: events.length, events })
}

/** POST /api/calendar/events { type, title, start, end?, all_day?, … }: the team adds an event. See GET /api/calendar/lookup. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorizedResponse(session)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send a JSON body' }, { status: 400 })
  try {
    const viewer = await calendarViewer(session.user as { id: string; role?: string | null })
    return NextResponse.json({ event: await createCalendarEvent(viewer, body, { defer: (work) => after(work) }) }, { status: 201 })
  } catch (e) {
    if (e instanceof CalendarError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
