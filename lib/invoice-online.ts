/**
 * Server side of paying an invoice online: opening the provider's page for an invoice, and settling the invoice
 * when a verified notification comes back. The provider logic itself is in lib/payment-gateway.ts.
 */
import { companies, find, get, invoices, type InvoicesRow, update } from '@/lib/fsdb'
import { InvoiceError, payInvoice } from '@/lib/invoices'
import { createCheckout, gatewayAmount, type GatewayConfig, handleGatewayEvent, mayPayOnline, newOrderId, type SettleDeps } from '@/lib/payment-gateway'

/** A page we opened is reused while it is surely still open (they are made to last 3 days) */
const REUSE_MS = 2 * 24 * 3600 * 1000

export async function startOnlinePayment(inv: InvoicesRow, cfg: GatewayConfig, origin: string): Promise<{ url: string }> {
  if (!mayPayOnline(inv, cfg)) throw new InvoiceError('This invoice cannot be paid online')
  if (inv.gatewayUrl && inv.gatewayProvider === cfg.provider && inv.gatewayCreatedAt && Date.now() - new Date(inv.gatewayCreatedAt).getTime() < REUSE_MS) return { url: inv.gatewayUrl }

  const company = await get(companies, inv.companyId)
  const orderId = newOrderId(inv.number)
  const { url } = await createCheckout(cfg, {
    orderId,
    invoiceNumber: inv.number,
    amount: gatewayAmount(inv.total), // always from the stored invoice, never from the request
    customerName: company?.name ?? 'Customer',
    customerEmail: company?.email ?? '',
    returnUrl: `${origin}/invoices/${inv.id}`,
  })
  await update(invoices, inv.id, { gatewayProvider: cfg.provider, gatewayOrderId: orderId, gatewayUrl: url, gatewayCreatedAt: new Date(), updatedAt: new Date() })
  return { url }
}

/** The database side of handleGatewayEvent */
export const settleDeps: SettleDeps = {
  findByOrderId: async (orderId) => {
    const [inv] = await find(invoices, { where: [['gatewayOrderId', '==', orderId]], limit: 1 })
    return inv ? { id: inv.id, number: inv.number, status: inv.status, total: inv.total, gatewayOrderId: inv.gatewayOrderId ?? null } : null
  },
  pay: async (id, reference) => {
    await payInvoice(id, 'payment', 'gateway', reference)
  },
  clearSession: async (id) => {
    await update(invoices, id, { gatewayProvider: null, gatewayOrderId: null, gatewayUrl: null, gatewayCreatedAt: null, updatedAt: new Date() })
  },
  // Invoice notes are printed on the invoice and visible to the client, so these go to the server log instead
  note: async (id, text) => {
    console.warn(`[payment-gateway] invoice ${id}: ${text}`)
  },
}

export { handleGatewayEvent }
