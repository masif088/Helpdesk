import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { companyPayments, get, remove } from '@/lib/fsdb'

/** DELETE /api/companies/[id]/payments/[paymentId] — remove a recorded payment. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id, paymentId } = await params
  const row = await get(companyPayments, paymentId)
  if (!row || row.companyId !== id) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  await remove(companyPayments, paymentId)
  return NextResponse.json({ ok: true })
}
