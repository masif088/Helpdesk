import dayjs from 'dayjs'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { isRateCurrency } from '@/lib/billing-rate'
import { companyDepositBalance, invoiceLinesFor } from '@/lib/invoices'

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && dayjs(v).isValid()

/** GET /api/invoices/preview?company_id=&from=&to=&currency= — lines and total before creating, plus the deposit balance */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const q = new URL(request.url).searchParams
  const companyId = q.get('company_id')
  const from = q.get('from')
  const to = q.get('to')
  const currency = q.get('currency')
  if (!companyId || !isDate(from) || !isDate(to) || !isRateCurrency(currency)) {
    return NextResponse.json({ error: 'company_id, from, to and currency are required' }, { status: 400 })
  }
  const [lines, balance] = await Promise.all([invoiceLinesFor(companyId, from, to, currency), companyDepositBalance(companyId)])
  const total = Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100
  return NextResponse.json({ lines, total, balance: balance.get(currency) ?? 0 })
}
