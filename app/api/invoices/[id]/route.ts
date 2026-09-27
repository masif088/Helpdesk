import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { get, invoices, update } from '@/lib/fsdb'
import { companyName, invoiceToJson, setInvoicePaid } from '@/lib/invoices'

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

/** PATCH { status: 'paid' | 'issued' | 'void', notes? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await staffSession()
  if (s.error) return s.error
  const id = (await params).id
  const inv = await get(invoices, id)
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = (await request.json().catch(() => ({}))) as { status?: string; notes?: string | null }
  let row = inv
  if (b.status === 'paid' || b.status === 'issued') row = (await setInvoicePaid(id, b.status === 'paid', s.userId!)) ?? inv
  if (b.status === 'void') {
    if (inv.status === 'paid') return NextResponse.json({ error: 'Mark it unpaid before voiding' }, { status: 400 })
    row = (await update(invoices, id, { status: 'void', updatedAt: new Date() })) ?? inv
  }
  if (b.notes !== undefined) row = (await update(invoices, id, { notes: b.notes?.trim() || null, updatedAt: new Date() })) ?? row
  return NextResponse.json(invoiceToJson(row, await companyName(row.companyId)))
}
