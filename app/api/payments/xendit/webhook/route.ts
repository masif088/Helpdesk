import { NextResponse } from 'next/server'

import { handleGatewayEvent, settleDeps } from '@/lib/invoice-online'
import { gatewayConfig, verifyXendit, type XenditNotification, xenditOutcome } from '@/lib/payment-gateway'

/**
 * Xendit invoice callback (set this URL for "Invoices paid" and "Invoices expired" in the Xendit dashboard).
 * Public by nature, so nothing is believed until the x-callback-token matches ours.
 */
export async function POST(request: Request) {
  const cfg = gatewayConfig()
  if (!cfg || cfg.provider !== 'xendit') return NextResponse.json({ error: 'Not enabled' }, { status: 404 })
  if (!verifyXendit(request.headers.get('x-callback-token'), cfg.xenditCallbackToken)) return NextResponse.json({ error: 'Bad token' }, { status: 401 })
  const n = (await request.json().catch(() => null)) as XenditNotification | null
  if (!n?.external_id) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const result = await handleGatewayEvent(settleDeps, {
    provider: 'xendit',
    orderId: n.external_id,
    outcome: xenditOutcome(n),
    amount: typeof n.paid_amount === 'number' ? n.paid_amount : typeof n.amount === 'number' ? n.amount : null,
    reference: n.id || n.external_id,
  })
  return NextResponse.json({ ok: true, result })
}
