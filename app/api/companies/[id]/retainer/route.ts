import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isAdminOrManager } from '@/lib/auth-utils'
import { companies, get, update } from '@/lib/fsdb'
import { InvoiceError } from '@/lib/invoices'
import { cleanRetainer, issueRetainerInvoice, jakartaDate } from '@/lib/retainer'

export const dynamic = 'force-dynamic'

async function gate() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = denyUnless(session.user, isAdminOrManager)
  return denied ? { error: denied } : { userId: String(session.user.id) }
}

/** GET /api/companies/[id]/retainer — the monthly retainer (null = none). Admin / manager. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.error) return g.error
  const company = await get(companies, (await params).id)
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  return NextResponse.json({ retainer: company.retainer ?? null, currentMonth: jakartaDate().month })
}

/** PUT /api/companies/[id]/retainer { active, amount, currency, label, startMonth, dueDays, autoSend } — save; `null` removes it. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.error) return g.error
  const id = (await params).id
  const company = await get(companies, id)
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { retainer?: unknown }
  try {
    const retainer = body.retainer === null ? null : cleanRetainer(body.retainer, company.retainer ?? null)
    const updated = await update(companies, id, { retainer, updatedAt: new Date() })
    return NextResponse.json({ retainer: updated?.retainer ?? null })
  } catch (e) {
    if (e instanceof InvoiceError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}

/** POST /api/companies/[id]/retainer { month? } — invoice a month now (default: this month); never twice for one month. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.error) return g.error
  const id = (await params).id
  const body = (await request.json().catch(() => ({}))) as { month?: string }
  try {
    const inv = await issueRetainerInvoice(id, body.month || jakartaDate().month, g.userId!)
    if (!inv) return NextResponse.json({ error: 'That month is already invoiced' }, { status: 409 })
    return NextResponse.json({ id: inv.id, number: inv.number })
  } catch (e) {
    if (e instanceof InvoiceError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
