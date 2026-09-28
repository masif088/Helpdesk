import dayjs from 'dayjs'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { isRateCurrency } from '@/lib/billing-rate'
import { companies, find, get, invoices } from '@/lib/fsdb'
import { createInvoice, invoiceToJson, payInvoice } from '@/lib/invoices'

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && dayjs(v).isValid()

async function staffSession() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAdminOrManager((session.user as { role?: string }).role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

/** GET /api/invoices?company_id= — admin / manager */
export async function GET(request: Request) {
  const s = await staffSession()
  if (s.error) return s.error
  const companyId = new URL(request.url).searchParams.get('company_id')
  const rows = companyId
    ? await find(invoices, { where: [['companyId', '==', companyId]], orderBy: [['issueDate', 'desc']] })
    : await find(invoices, { orderBy: [['issueDate', 'desc']], limit: 200 })
  return NextResponse.json(rows.map((r) => invoiceToJson(r)))
}

/** POST /api/invoices { company_id, from, to, currency, issue_date, due_date?, notes? } */
export async function POST(request: Request) {
  const s = await staffSession()
  if (s.error) return s.error
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const companyId = typeof b.company_id === 'string' ? b.company_id : ''
  if (!companyId || !(await get(companies, companyId))) return NextResponse.json({ error: 'Company not found' }, { status: 400 })
  if (!isDate(b.from) || !isDate(b.to) || dayjs(b.from).isAfter(dayjs(b.to))) {
    return NextResponse.json({ error: 'A valid period is required' }, { status: 400 })
  }
  if (!isRateCurrency(b.currency)) return NextResponse.json({ error: 'currency must be IDR or USD' }, { status: 400 })
  const issueDate = isDate(b.issue_date) ? b.issue_date : dayjs().format('YYYY-MM-DD')
  const dueDate = isDate(b.due_date) ? b.due_date : null
  try {
    const inv = await createInvoice({
      companyId,
      from: b.from,
      to: b.to,
      currency: b.currency,
      issueDate,
      dueDate,
      notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null,
      createdBy: s.userId!,
    })
    // Settle straight from the deposit balance when asked (the invoice stays issued if the balance falls short)
    if (b.pay_from_balance === true) {
      try {
        return NextResponse.json(invoiceToJson(await payInvoice(inv.id, 'balance', s.userId!)))
      } catch {
        return NextResponse.json({ ...invoiceToJson(inv), warning: 'Created, but the deposit balance does not cover it' })
      }
    }
    return NextResponse.json(invoiceToJson(inv))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create the invoice' }, { status: 400 })
  }
}
