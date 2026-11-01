import { getAppSettings } from '@/lib/app-settings'
import { getAppTimeZone } from '@/lib/app-time-server'
import { calendarViewer, listCalendarItems } from '@/lib/calendar'
import { userForFeedToken } from '@/lib/calendar-feed'
import { buildIcs } from '@/lib/calendar-ics'

export const dynamic = 'force-dynamic'

const DAY = 86_400_000

/**
 * GET /api/calendar/ics/{token}.ics: a person's calendar as an iCal feed (the link made by "Subscribe" in the calendar). The secret link stands
 * in for the login: it shows exactly what that person sees, from 30 days back to 180 days ahead. A wrong or reset link answers 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const user = await userForFeedToken((await params).token)
  if (!user) return new Response('Not found', { status: 404 })

  const now = new Date()
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, '')
  const [items, settings] = await Promise.all([
    listCalendarItems(await calendarViewer({ id: user.id, role: user.role }), { from: new Date(now.getTime() - 30 * DAY), to: new Date(now.getTime() + 180 * DAY), includeDerived: true, timeZone: await getAppTimeZone() }),
    getAppSettings().catch(() => null),
  ])
  const body = buildIcs(items, { name: `${settings?.app_name || 'Helpdesk'} calendar`, now, host: new URL(base).host, baseUrl: base })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="calendar.ics"',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  })
}
