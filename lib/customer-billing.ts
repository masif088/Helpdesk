/**
 * What a client sees of their own billing in the portal: deposit balance, invoices (never void ones) and the
 * payments we received. Internal figures (hours, rates per ticket, work not invoiced yet) stay staff-only.
 * Only the company's portal admin may see it.
 */
import type { Money } from '@/lib/company-billing'
import { getCustomerCompanyId, isCompanyPortalAdmin } from '@/lib/customer-company'
import { companyPayments, find, invoices } from '@/lib/fsdb'

export type CustomerBilling = {
  depositBalance: Money[]
  unpaidInvoices: Money[]
  invoices: {
    id: string
    number: string
    period_from: string
    period_to: string
    issue_date: string
    due_date: string | null
    total: number
    currency: string
    /** issued | paid */
    status: string
    paid_at: string | null
  }[]
  payments: { id: string; amount: number; currency: string; paid_at: string; reference: string | null }[]
}

/** The company whose billing this customer may see (portal admin only), or null. */
export async function customerBillingCompanyId(userId: string): Promise<string | null> {
  const companyId = await getCustomerCompanyId(userId)
  if (!companyId) return null
  return (await isCompanyPortalAdmin(userId, companyId)) ? companyId : null
}

const toMoney = (m: Map<string, number>): Money[] =>
  [...m.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency))

export async function getCustomerBilling(companyId: string): Promise<CustomerBilling> {
  const [invoiceRows, paymentRows] = await Promise.all([
    find(invoices, { where: [['companyId', '==', companyId]], orderBy: [['issueDate', 'desc']] }),
    find(companyPayments, { where: [['companyId', '==', companyId]], orderBy: [['paidAt', 'desc']] }),
  ])
  const deposit = new Map<string, number>()
  const unpaid = new Map<string, number>()
  for (const p of paymentRows) deposit.set(p.currency, (deposit.get(p.currency) ?? 0) + p.amount)
  const visible = invoiceRows.filter((i) => i.status !== 'void')
  for (const i of visible) {
    if (i.status === 'paid') deposit.set(i.currency, (deposit.get(i.currency) ?? 0) - i.total)
    else unpaid.set(i.currency, (unpaid.get(i.currency) ?? 0) + i.total)
  }
  return {
    depositBalance: toMoney(deposit),
    unpaidInvoices: toMoney(unpaid),
    invoices: visible.map((i) => ({
      id: i.id,
      number: i.number,
      period_from: i.periodFrom,
      period_to: i.periodTo,
      issue_date: i.issueDate,
      due_date: i.dueDate,
      total: i.total,
      currency: i.currency,
      status: i.status,
      paid_at: i.paidAt ?? null,
    })),
    payments: paymentRows.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      paid_at: p.paidAt.toISOString(),
      reference: p.reference ?? null,
    })),
  }
}
