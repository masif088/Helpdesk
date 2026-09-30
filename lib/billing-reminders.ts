/**
 * Billing reminders as ordinary bell notifications (run hourly with the inbox reminders):
 *   - an invoice passed its due date unpaid → admins, managers and the client's portal admins, once per invoice
 *   - a client's deposit no longer covers what they owe (unpaid invoices + work not invoiced yet) → admins and
 *     managers, once until the deposit covers it again
 */
import dayjs from 'dayjs'

import { formatMoney } from '@/lib/billing-rate'
import { getCompanyBilling } from '@/lib/company-billing'
import { notifyUsers } from '@/lib/firebase/ticket-notifications-server'
import { companies, companyPayments, companyUsers, find, invoices, update, users } from '@/lib/fsdb'

export type BillingReminderResult = { overdueInvoices: string[]; lowDeposit: string[] }

const moneyText = (m: Map<string, number>) =>
  [...m.entries()]
    .filter(([, v]) => v > 0.005)
    .map(([c, v]) => formatMoney(v, c))
    .join(' + ')

/** `dryRun` lists what would be notified without notifying or marking anything. */
export async function runBillingReminders(opts: { dryRun?: boolean } = {}): Promise<BillingReminderResult> {
  const [invoiceRows, paymentRows, companyRows, staff, portalAdmins] = await Promise.all([
    find(invoices),
    find(companyPayments, { select: ['companyId', 'currency', 'amount'] }),
    find(companies, { select: ['id', 'name', 'lowDepositNotifiedAt'] }),
    find(users, { where: [['role', 'in', ['admin', 'manager']]] }),
    find(companyUsers, { where: [['companyRole', '==', 'company_admin']] }),
  ])
  const companyById = new Map(companyRows.map((c) => [c.id, c]))
  const staffIds = staff.filter((u) => !u.deletedAt && u.status !== 'inactive').map((u) => u.id)
  const result: BillingReminderResult = { overdueInvoices: [], lowDeposit: [] }

  // 1. Invoices past their due date
  const today = dayjs().startOf('day')
  for (const inv of invoiceRows) {
    if (inv.status !== 'issued' || !inv.dueDate || inv.overdueNotifiedAt || !dayjs(inv.dueDate).isBefore(today)) continue
    const company = companyById.get(inv.companyId)
    result.overdueInvoices.push(inv.number)
    if (opts.dryRun) continue
    const total = formatMoney(inv.total, inv.currency)
    const due = dayjs(inv.dueDate).format('D MMM YYYY')
    await notifyUsers({
      recipientUserIds: staffIds,
      type: 'invoice_overdue',
      href: `/invoices/${inv.id}`,
      label: inv.number,
      title: 'Invoice past its due date',
      body: `${inv.number} for ${company?.name ?? 'a client'} (${total}) was due on ${due}`,
    })
    await notifyUsers({
      recipientUserIds: portalAdmins.filter((a) => a.companyId === inv.companyId).map((a) => a.userId),
      type: 'invoice_overdue',
      href: `/invoices/${inv.id}`,
      label: inv.number,
      title: 'Invoice past its due date',
      body: `${inv.number} (${total}) was due on ${due}`,
    })
    await update(invoices, inv.id, { overdueNotifiedAt: new Date() })
  }

  // 2. Deposits that no longer cover what the client owes (only clients that keep a deposit)
  const deposit = new Map<string, Map<string, number>>()
  const add = (companyId: string, currency: string, v: number) => {
    const m = deposit.get(companyId) ?? new Map<string, number>()
    m.set(currency, (m.get(currency) ?? 0) + v)
    deposit.set(companyId, m)
  }
  for (const p of paymentRows) add(p.companyId, p.currency, p.amount)
  for (const inv of invoiceRows) if (inv.status === 'paid') add(inv.companyId, inv.currency, -inv.total)

  for (const c of companyRows) {
    const balance = deposit.get(c.id)
    const keepsDeposit = !!balance && [...balance.values()].some((v) => v > 0.005)
    let short: Map<string, number> | null = null
    if (keepsDeposit) {
      const b = await getCompanyBilling(c.id)
      const owed = new Map<string, number>()
      for (const m of [...b.unpaidInvoices, ...b.notInvoiced]) owed.set(m.currency, (owed.get(m.currency) ?? 0) + m.amount)
      const missing = new Map([...owed].map(([cur, v]) => [cur, v - (balance!.get(cur) ?? 0)] as const).filter(([, v]) => v > 0.005))
      if (missing.size) short = missing
    }
    if (!short) {
      // Covered again: the next shortfall notifies anew
      if (c.lowDepositNotifiedAt && !opts.dryRun) await update(companies, c.id, { lowDepositNotifiedAt: null })
      continue
    }
    if (c.lowDepositNotifiedAt) continue
    result.lowDeposit.push(c.name)
    if (opts.dryRun) continue
    await notifyUsers({
      recipientUserIds: staffIds,
      type: 'deposit_low',
      href: `/companies/${c.id}?tab=billing`,
      label: 'Billing',
      title: 'Deposit does not cover what is owed',
      body: `${c.name}: deposit ${moneyText(balance!) || formatMoney(0, 'IDR')}, short by ${moneyText(short)} (unpaid invoices and work not invoiced yet)`,
    })
    await update(companies, c.id, { lowDepositNotifiedAt: new Date() })
  }
  return result
}
