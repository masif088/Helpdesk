import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { unauthorizedResponse } from '@/lib/api-key-http'
import { CalendarError, calendarViewer, deleteCalendarEvent, getCalendarEvent, updateCalendarEvent } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function run(request: Request, ctx: Ctx, fn: (viewer: Awaited<ReturnType<typeof calendarViewer>>, id: string, body: Record<string, unknown>) => Promise<Response>) {
  const session = await auth()
  if (!session?.user?.id) return unauthorizedResponse(session)
  try {
    const viewer = await calendarViewer(session.user as { id: string; role?: string | null })
    const body = request.method === 'PATCH' ? ((await request.json().catch(() => null)) as Record<string, unknown> | null) : {}
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send a JSON body' }, { status: 400 })
    return await fn(viewer, (await ctx.params).id, body)
  } catch (e) {
    if (e instanceof CalendarError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

/** GET /api/calendar/events/{id}: one stored event (a repeating event comes back as its first occurrence). */
export const GET = (request: Request, ctx: Ctx) => run(request, ctx, async (viewer, id) => NextResponse.json({ event: await getCalendarEvent(viewer, id) }))

/** PATCH /api/calendar/events/{id}: send only the fields to change (same names as when creating). */
export const PATCH = (request: Request, ctx: Ctx) => run(request, ctx, async (viewer, id, body) => NextResponse.json({ event: await updateCalendarEvent(viewer, id, body) }))

/** DELETE /api/calendar/events/{id}: removes the event (and all occurrences of a repeating one). */
export const DELETE = (request: Request, ctx: Ctx) =>
  run(request, ctx, async (viewer, id) => {
    await deleteCalendarEvent(viewer, id)
    return NextResponse.json({ ok: true })
  })
