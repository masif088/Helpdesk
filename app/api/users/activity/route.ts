import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { unauthorizedResponse } from '@/lib/api-key-http'
import { isAdminOrManager } from '@/lib/auth-utils'
import { calendarViewer } from '@/lib/calendar'
import { loadPeopleActivity } from '@/lib/people-activity'
import { parseActivityQuery } from '@/lib/people-activity-core'

export const dynamic = 'force-dynamic'

/**
 * GET /api/users/activity?from=2026-11-03T09:00:00Z&to=2026-11-03T17:00:00Z&company_ids=…&skills=WordPress&type_ids=3
 * Who worked in the period and how loaded the team is, per team member: time tracked (clipped to the period), tickets worked on,
 * a running timer, open tickets assigned, and leave and meetings from the calendar. Admin and manager only (it shows what
 * colleagues did). See `lib/people-activity-core.ts` for the filters.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorizedResponse(session)
  const user = session.user as { id: string; role?: string | null }
  if (!isAdminOrManager(user.role ?? undefined)) return NextResponse.json({ error: 'Only admins and managers can see the team activity' }, { status: 403 })

  const query = parseActivityQuery(new URL(request.url).searchParams, user.id)
  if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 })
  return NextResponse.json(await loadPeopleActivity(query, await calendarViewer(user)))
}
