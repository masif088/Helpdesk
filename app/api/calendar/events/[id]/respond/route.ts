import { after, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { unauthorizedResponse } from '@/lib/api-key-http'
import { CalendarError, calendarViewer, respondToCalendarEvent } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

/** POST /api/calendar/events/{id}/respond { response: "accepted" | "declined" | "tentative" }: an invited person answers; the maker is told. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorizedResponse(session)
  const body = (await request.json().catch(() => ({}))) as { response?: unknown }
  try {
    const viewer = await calendarViewer(session.user as { id: string; role?: string | null })
    return NextResponse.json({ event: await respondToCalendarEvent(viewer, (await params).id, body.response, { defer: (work) => after(work) }) })
  } catch (e) {
    if (e instanceof CalendarError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
