import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { isRateCurrency } from '@/lib/billing-rate'
import { companies, companyPayments, get, insert } from '@/lib/fsdb'

/** POST /api/companies/[id]/payments — record a payment { amount, currency, paid_at?, reference?, note? }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  if (!(await get(companies, id))) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a number > 0' }, { status: 400 })
  }
  if (!isRateCurrency(body.currency)) {
    return NextResponse.json({ error: 'currency must be IDR or USD' }, { status: 400 })
  }
  const paidAt = body.paid_at ? new Date(String(body.paid_at)) : new Date()
  if (Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: 'Invalid paid_at' }, { status: 400 })
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

  const row = await insert(companyPayments, {
    companyId: id,
    amount: Math.round(amount * 100) / 100,
    currency: body.currency,
    paidAt,
    reference: text(body.reference, 120),
    note: text(body.note, 500),
    createdBy: session.user.id ?? null,
  })
  return NextResponse.json({ data: { id: row.id } }, { status: 201 })
}
