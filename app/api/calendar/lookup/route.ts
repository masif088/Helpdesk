import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { unauthorizedResponse } from '@/lib/api-key-http'
import { calendarLookup, calendarViewer } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

/** GET /api/calendar/lookup: event types, repeat choices and what the caller may create. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorizedResponse(session)
  const viewer = await calendarViewer(session.user as { id: string; role?: string | null })
  return NextResponse.json(calendarLookup(viewer))
}
