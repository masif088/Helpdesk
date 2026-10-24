import { NextResponse } from 'next/server'

import { handleGatewayEvent, settleDeps } from '@/lib/invoice-online'
import { gatewayConfig, type MidtransNotification, midtransOutcome, verifyMidtrans } from '@/lib/payment-gateway'

/**
 * Midtrans payment notification (set this URL as "Payment Notification URL" in the Midtrans dashboard).
 * Public by nature, so nothing is believed until the signature made with our server key checks out.
 */
export async function POST(request: Request) {
  const cfg = gatewayConfig()
  if (!cfg || cfg.provider !== 'midtrans') return NextResponse.json({ error: 'Not enabled' }, { status: 404 })
  const n = (await request.json().catch(() => null)) as MidtransNotification | null
  if (!n || !verifyMidtrans(n, cfg.midtransServerKey)) return NextResponse.json({ error: 'Bad signature' }, { status: 401 })

  const result = await handleGatewayEvent(settleDeps, {
    provider: 'midtrans',
    orderId: String(n.order_id),
    outcome: midtransOutcome(n),
    amount: n.gross_amount ? Number(n.gross_amount) : null,
    reference: n.transaction_id || String(n.order_id),
  })
  return NextResponse.json({ ok: true, result })
}
