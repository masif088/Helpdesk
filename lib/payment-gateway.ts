/**
 * Online payment of invoices through Midtrans (Snap) or Xendit (Invoice): a hosted page, so no card data touches this app.
 * The customer pays on the provider's page; the provider calls our webhook; only a verified, matching, paid notification settles the invoice.
 *
 * This file has no database and no path aliases, so it can be tested on its own (tests/payment-gateway.test.mjs). The routes that
 * use it are app/api/invoices/[id]/pay-online and app/api/payments/{midtrans,xendit}/webhook.
 */
import crypto from 'node:crypto'

export type Provider = 'midtrans' | 'xendit'

export type GatewayConfig = {
  provider: Provider
  /** Midtrans: use the live API instead of the sandbox */
  production: boolean
  midtransServerKey: string
  xenditSecretKey: string
  xenditCallbackToken: string
}

/**
 * Which provider is switched on, from the environment (never from the database or the repository):
 *   PAYMENT_PROVIDER=midtrans   MIDTRANS_SERVER_KEY   [MIDTRANS_IS_PRODUCTION=true]
 *   PAYMENT_PROVIDER=xendit     XENDIT_SECRET_KEY     XENDIT_CALLBACK_TOKEN
 * null when none is set up (the "Pay online" button then does not appear).
 */
export function gatewayConfig(env: Record<string, string | undefined> = process.env): GatewayConfig | null {
  const provider = (env.PAYMENT_PROVIDER ?? '').trim().toLowerCase()
  const cfg: GatewayConfig = {
    provider: provider === 'xendit' ? 'xendit' : 'midtrans',
    production: (env.MIDTRANS_IS_PRODUCTION ?? '').toLowerCase() === 'true',
    midtransServerKey: (env.MIDTRANS_SERVER_KEY ?? '').trim(),
    xenditSecretKey: (env.XENDIT_SECRET_KEY ?? '').trim(),
    xenditCallbackToken: (env.XENDIT_CALLBACK_TOKEN ?? '').trim(),
  }
  if (provider === 'midtrans' && cfg.midtransServerKey) return cfg
  if (provider === 'xendit' && cfg.xenditSecretKey && cfg.xenditCallbackToken) return cfg
  return null
}

/** Both providers settle in rupiah here; other currencies are paid the usual way (a recorded payment or the deposit). */
export const PAYABLE_CURRENCY = 'IDR'

/** The amount the provider is asked for: whole rupiah. */
export const gatewayAmount = (total: number) => Math.round(Number.isFinite(total) ? total : 0)

/** May this invoice be paid online now? */
export function mayPayOnline(inv: { status: string; currency: string; total: number }, cfg: GatewayConfig | null): boolean {
  return !!cfg && inv.status === 'issued' && inv.currency === PAYABLE_CURRENCY && gatewayAmount(inv.total) > 0
}

/** A reference that is new for every payment attempt (the providers refuse a repeated one): INV-2026-0007-m3k9x2 */
export function newOrderId(invoiceNumber: string, now = Date.now(), random = Math.random()): string {
  const suffix = `${now.toString(36)}${Math.floor(random * 1296).toString(36)}`
  return `${invoiceNumber.replace(/[^A-Za-z0-9-_.]/g, '-')}-${suffix}`.slice(0, 50)
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// ---------- Midtrans

/** The signature Midtrans puts on a notification: SHA-512 of order id + status code + gross amount + server key. */
export const midtransSignature = (orderId: string, statusCode: string, grossAmount: string, serverKey: string) => crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest('hex')

export type MidtransNotification = { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string; transaction_status?: string; fraud_status?: string; transaction_id?: string; payment_type?: string }

export function verifyMidtrans(n: MidtransNotification, serverKey: string): boolean {
  if (!serverKey || !n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false
  return safeEqual(midtransSignature(n.order_id, n.status_code, n.gross_amount, serverKey), String(n.signature_key))
}

export type Outcome = 'paid' | 'pending' | 'failed'

/** Money is in only for "settlement", or "capture" of a card that fraud screening accepted. */
export function midtransOutcome(n: Pick<MidtransNotification, 'transaction_status' | 'fraud_status'>): Outcome {
  const s = n.transaction_status
  if (s === 'settlement') return 'paid'
  if (s === 'capture') return n.fraud_status === 'accept' || n.fraud_status === undefined ? 'paid' : 'pending'
  if (s === 'deny' || s === 'cancel' || s === 'expire' || s === 'failure') return 'failed'
  return 'pending'
}

// ---------- Xendit

export type XenditNotification = { id?: string; external_id?: string; status?: string; amount?: number; paid_amount?: number }

/** Xendit puts the token you configured in the header x-callback-token. */
export const verifyXendit = (headerToken: string | null | undefined, expected: string) => !!expected && !!headerToken && safeEqual(headerToken, expected)

export function xenditOutcome(n: Pick<XenditNotification, 'status'>): Outcome {
  const s = (n.status ?? '').toUpperCase()
  if (s === 'PAID' || s === 'SETTLED') return 'paid'
  if (s === 'EXPIRED' || s === 'FAILED') return 'failed'
  return 'pending'
}

// ---------- Opening a payment page

type Fetch = typeof fetch

export type CheckoutInput = { orderId: string; invoiceNumber: string; amount: number; customerName: string; customerEmail: string; returnUrl: string }

/** Midtrans Snap: returns the page the customer pays on. */
export async function createMidtransCheckout(cfg: GatewayConfig, c: CheckoutInput, fetchImpl: Fetch = fetch): Promise<{ url: string }> {
  const base = cfg.production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com'
  const res = await fetchImpl(`${base}/snap/v1/transactions`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${cfg.midtransServerKey}:`).toString('base64')}` },
    body: JSON.stringify({
      transaction_details: { order_id: c.orderId, gross_amount: c.amount },
      item_details: [{ id: c.invoiceNumber, price: c.amount, quantity: 1, name: `Invoice ${c.invoiceNumber}`.slice(0, 50) }],
      customer_details: { first_name: c.customerName.slice(0, 50), email: c.customerEmail },
      callbacks: { finish: c.returnUrl },
      expiry: { unit: 'day', duration: 3 },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as { redirect_url?: string; error_messages?: string[] }
  if (!res.ok || !data.redirect_url) throw new Error(`Midtrans: ${data.error_messages?.[0] ?? `could not open the payment page (${res.status})`}`)
  return { url: data.redirect_url }
}

/** Xendit Invoice: returns the page the customer pays on. */
export async function createXenditCheckout(cfg: GatewayConfig, c: CheckoutInput, fetchImpl: Fetch = fetch): Promise<{ url: string }> {
  const res = await fetchImpl('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${cfg.xenditSecretKey}:`).toString('base64')}` },
    body: JSON.stringify({ external_id: c.orderId, amount: c.amount, currency: PAYABLE_CURRENCY, payer_email: c.customerEmail || undefined, description: `Invoice ${c.invoiceNumber}`, success_redirect_url: c.returnUrl, invoice_duration: 3 * 24 * 3600 }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as { invoice_url?: string; message?: string }
  if (!res.ok || !data.invoice_url) throw new Error(`Xendit: ${data.message ?? `could not open the payment page (${res.status})`}`)
  return { url: data.invoice_url }
}

export const createCheckout = (cfg: GatewayConfig, c: CheckoutInput, fetchImpl: Fetch = fetch) => (cfg.provider === 'xendit' ? createXenditCheckout(cfg, c, fetchImpl) : createMidtransCheckout(cfg, c, fetchImpl))

// ---------- What a verified notification does

export type GatewayEvent = { provider: Provider; orderId: string; outcome: Outcome; /** What the provider says was paid; null when it did not say */ amount: number | null; reference: string }

export type InvoiceLike = { id: string; number: string; status: string; total: number; gatewayOrderId: string | null }

export type SettleDeps = {
  findByOrderId: (orderId: string) => Promise<InvoiceLike | null>
  /** Mark the invoice paid with a new payment; throws when it cannot be (already paid, void) */
  pay: (invoiceId: string, reference: string) => Promise<void>
  /** Forget the open payment page of an invoice (expired / failed) so a new one can be made */
  clearSession: (invoiceId: string) => Promise<void>
  note: (invoiceId: string, text: string) => Promise<void>
}

export type SettleResult = 'paid' | 'already' | 'pending' | 'failed' | 'unknown' | 'amount_mismatch'

/**
 * Apply a notification that has already been verified (signature / token). It only pays the invoice when the money is in, the
 * order id is the one we opened for this invoice, and the amount is at least what the invoice says (never trust the amount from
 * the browser; this one comes from the provider). Safe to run twice: the second time finds the invoice already paid.
 */
export async function handleGatewayEvent(deps: SettleDeps, e: GatewayEvent): Promise<SettleResult> {
  const inv = await deps.findByOrderId(e.orderId)
  if (!inv || inv.gatewayOrderId !== e.orderId) return 'unknown'
  if (e.outcome === 'pending') return 'pending'
  if (e.outcome === 'failed') {
    if (inv.status === 'issued') await deps.clearSession(inv.id)
    return 'failed'
  }
  if (inv.status !== 'issued') {
    if (inv.status === 'void') await deps.note(inv.id, `Payment of ${e.amount ?? '?'} arrived through ${e.provider} for a void invoice (${e.reference}). Refund it with the provider.`)
    return 'already'
  }
  if (e.amount === null || Math.round(e.amount) < gatewayAmount(inv.total)) {
    await deps.note(inv.id, `${e.provider} reported ${e.amount ?? 'no amount'} for ${inv.number}, which is less than ${gatewayAmount(inv.total)}. Not settled; check ${e.reference}.`)
    return 'amount_mismatch'
  }
  try {
    await deps.pay(inv.id, e.reference)
  } catch {
    return 'already' // somebody (an admin, or the same notification a moment ago) settled it first
  }
  return 'paid'
}
