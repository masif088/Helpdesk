import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { getRatingsPage } from '@/lib/ratings-list'

/** GET /api/reports/ratings?month=YYYY-MM&page=1 — admin / manager. Rated tickets of one month, a page at a time. */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(request.url)
  return NextResponse.json(await getRatingsPage(url.searchParams.get('month'), parseInt(url.searchParams.get('page') ?? '1', 10)))
}
