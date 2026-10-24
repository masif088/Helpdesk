import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { customerBillingCompanyId } from '@/lib/customer-billing'
import { get, invoices } from '@/lib/fsdb'
import { startOnlinePayment } from '@/lib/invoice-online'
import { InvoiceError } from '@/lib/invoices'
import { gatewayConfig } from '@/lib/payment-gateway'

/**
 * POST → { url } of the provider's payment page for this invoice.
 * Staff may open it for any invoice; a client only for their own company's (portal admin), never a void one.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  const staff = isAdminOrManager(role)
  const clientCompanyId = !staff && role?.toLowerCase() === 'customer' ? await customerBillingCompanyId(session.user.id) : null
  if (!staff && !clientCompanyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const inv = await get(invoices, (await params).id)
  if (!inv || (!staff && inv.companyId !== clientCompanyId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cfg = gatewayConfig()
  if (!cfg) return NextResponse.json({ error: 'Online payment is not set up' }, { status: 400 })
  const origin = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, '')
  try {
    return NextResponse.json(await startOnlinePayment(inv, cfg, origin))
  } catch (e) {
    if (e instanceof InvoiceError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
