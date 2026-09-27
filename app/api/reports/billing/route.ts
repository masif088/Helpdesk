import dayjs from 'dayjs'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { getBillingReport } from '@/lib/billing-report'

/** GET /api/reports/billing?from=YYYY-MM-DD&to=YYYY-MM-DD — admin / manager. Defaults to the current month. */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && dayjs(v).isValid() ? v : null)
  const from = valid(url.searchParams.get('from')) ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const to = valid(url.searchParams.get('to')) ?? dayjs().endOf('month').format('YYYY-MM-DD')
  if (dayjs(from).isAfter(dayjs(to))) return NextResponse.json({ error: '"from" must be before "to"' }, { status: 400 })

  return NextResponse.json(await getBillingReport(from, to))
}
