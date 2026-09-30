import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { customerBillingCompanyId, getCustomerBilling } from '@/lib/customer-billing'

/** GET /api/customer/billing — the signed-in portal admin's own company: deposit balance, invoices, payments. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role?.toLowerCase() !== 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const companyId = await customerBillingCompanyId(session.user.id)
  if (!companyId) return NextResponse.json({ error: 'Only a portal admin can see billing' }, { status: 403 })
  return NextResponse.json(await getCustomerBilling(companyId))
}
