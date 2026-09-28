import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { get, invoices, update } from '@/lib/fsdb'
import { companyName, InvoiceError, invoiceToJson, payInvoice, unpayInvoice } from '@/lib/invoices'

async function staffSession() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAdminOrManager((session.user as { role?: string }).role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await staffSession()
  if (s.error) return s.error
  const inv = await get(invoices, (await params).id)
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(invoiceToJson(inv, await companyName(inv.companyId)))
}

/**
 * PATCH { action: 'pay_from_balance' | 'record_payment' | 'mark_unpaid' | 'void', reference?, notes? }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await staffSession()
  if (s.error) return s.error
  const id = (await params).id
  const inv = await get(invoices, id)
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = (await request.json().catch(() => ({}))) as { action?: string; reference?: string; notes?: string | null }
  try {
    let row = inv
    if (b.action === 'pay_from_balance') row = await payInvoice(id, 'balance', s.userId!)
    else if (b.action === 'record_payment') row = await payInvoice(id, 'payment', s.userId!, b.reference)
    else if (b.action === 'mark_unpaid') row = await unpayInvoice(id)
    else if (b.action === 'void') {
      if (inv.status === 'paid') throw new InvoiceError('Mark it unpaid before voiding')
      row = (await update(invoices, id, { status: 'void', updatedAt: new Date() })) ?? inv
    }
    if (b.notes !== undefined) row = (await update(invoices, id, { notes: b.notes?.trim() || null, updatedAt: new Date() })) ?? row
    return NextResponse.json(invoiceToJson(row, await companyName(row.companyId)))
  } catch (e) {
    if (e instanceof InvoiceError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
