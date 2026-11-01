import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { currentFeedUrl, disableFeed, resetFeed } from '@/lib/calendar-feed'

export const dynamic = 'force-dynamic'

const baseOf = (request: Request) => (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, '')

/** GET /api/calendar/feed: your calendar feed link (an iCal URL for Google or Apple Calendar), or `url: null` when it is switched off. Login only, never a key. */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ url: await currentFeedUrl(baseOf(request), session.user.id) })
}

/** POST /api/calendar/feed { action: "reset" | "disable" }: make or renew your link (the old one stops at once), or switch it off. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { action?: unknown }
  try {
    if (body.action === 'disable') {
      await disableFeed(session.user.id)
      return NextResponse.json({ url: null })
    }
    if (body.action !== 'reset') return NextResponse.json({ error: 'action must be reset or disable' }, { status: 400 })
    return NextResponse.json({ url: await resetFeed(baseOf(request), session.user.id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}
