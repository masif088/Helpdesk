/**
 * Monthly retainer: a fixed fee a client pays every month, invoiced automatically.
 *
 * Set per company (Company -> Billing). From its start month on, the first hourly run in each month creates one
 * invoice with a single retainer line (no ticket) for that month. Work on top of the retainer (hourly or fixed-price
 * tickets) is invoiced the usual way. Months are never back-filled: only the current month is invoiced.
 * An invoice is never created twice for a month: the company remembers the last month invoiced, and an existing
 * non-void invoice with a line for that month counts too.
 */
import dayjs from 'dayjs'

import { getAppSettings } from '@/lib/app-settings'
import { formatMoney } from '@/lib/billing-rate'
import { notifyUsers } from '@/lib/firebase/ticket-notifications-server'
import { companies, find, get, insert, type InvoiceLine, invoices, type InvoicesRow, type Retainer, update, users } from '@/lib/fsdb'
import { defaultInvoiceRecipients, sendInvoiceEmail } from '@/lib/invoice-email'
import { InvoiceError, nextInvoiceNumber } from '@/lib/invoices'

export const DEFAULT_RETAINER_LABEL = 'Monthly retainer'
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** Today's date and month in Jakarta (the app's timezone), whatever the server clock says. */
export function jakartaDate(now = new Date()): { date: string; month: string } {
  const date = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
  return { date, month: date.slice(0, 7) }
}

export function monthLabel(month: string): string {
  return dayjs(`${month}-01`).format('MMMM YYYY')
}

/** Validate a retainer from a request; `lastMonth` is never taken from the client. Throws InvoiceError on bad input. */
export function cleanRetainer(raw: unknown, existing: Retainer | null): Retainer {
  const o = (raw ?? {}) as Record<string, unknown>
  const amount = Math.round(Number(o.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) throw new InvoiceError('The monthly amount must be greater than 0')
  const currency = String(o.currency ?? 'IDR').toUpperCase()
  if (currency !== 'IDR' && currency !== 'USD') throw new InvoiceError('Currency must be IDR or USD')
  const startMonth = String(o.startMonth ?? '')
  if (!MONTH.test(startMonth)) throw new InvoiceError('Pick the first month to invoice')
  const dueDays = Math.round(Number(o.dueDays ?? 14))
  if (!Number.isFinite(dueDays) || dueDays < 0 || dueDays > 120) throw new InvoiceError('Days until due must be between 0 and 120')
  return {
    active: o.active !== false,
    amount,
    currency,
    label: String(o.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || DEFAULT_RETAINER_LABEL,
    startMonth,
    dueDays,
    autoSend: o.autoSend === true,
    lastMonth: existing?.lastMonth ?? null,
  }
}

/** The retainer invoice already issued for a month (not void), if any. */
async function invoiceForMonth(companyId: string, month: string): Promise<InvoicesRow | null> {
  const rows = await find(invoices, { where: [['companyId', '==', companyId]] })
  return rows.find((i) => i.status !== 'void' && i.lines.some((l) => l.retainer && l.retainerMonth === month)) ?? null
}

/**
 * Create the retainer invoice for `month` (YYYY-MM). Returns null when that month already has one (and remembers it).
 * `issueDate` defaults to today in Jakarta.
 */
export async function issueRetainerInvoice(companyId: string, month: string, createdBy: string, issueDate?: string): Promise<InvoicesRow | null> {
  const company = await get(companies, companyId)
  const r = company?.retainer
  if (!company || !r) throw new InvoiceError('This client has no retainer')
  if (!MONTH.test(month)) throw new InvoiceError('Invalid month')
  const existing = await invoiceForMonth(companyId, month)
  if (existing) {
    if (r.lastMonth !== month) await update(companies, companyId, { retainer: { ...r, lastMonth: month }, updatedAt: new Date() })
    return null
  }
  const issued = issueDate ?? jakartaDate().date
  const start = dayjs(`${month}-01`)
  const line: InvoiceLine = {
    ticketId: 0,
    title: `${r.label} — ${monthLabel(month)}`,
    seconds: 0,
    rate: 0,
    amount: r.amount,
    retainer: true,
    retainerMonth: month,
  }
  const inv = await insert(invoices, {
    number: await nextInvoiceNumber(issued),
    companyId,
    currency: r.currency,
    periodFrom: start.format('YYYY-MM-DD'),
    periodTo: start.endOf('month').format('YYYY-MM-DD'),
    issueDate: issued,
    dueDate: dayjs(issued).add(r.dueDays, 'day').format('YYYY-MM-DD'),
    lines: [line],
    total: r.amount,
    status: 'issued',
    notes: null,
    createdBy,
  })
  await update(companies, companyId, { retainer: { ...r, lastMonth: month }, updatedAt: new Date() })
  return inv
}

export type RetainerRunResult = { created: string[]; emailed: string[]; failed: string[] }

/** Hourly: invoice every active retainer whose current month has not been invoiced. `dryRun` only lists them. */
export async function runRetainerInvoices(opts: { dryRun?: boolean; now?: Date } = {}): Promise<RetainerRunResult> {
  const { date, month } = jakartaDate(opts.now)
  const result: RetainerRunResult = { created: [], emailed: [], failed: [] }
  const rows = (await find(companies, { select: ['id', 'name', 'retainer', 'isActive'] })).filter(
    (c) => c.retainer?.active && c.isActive !== false && c.retainer.startMonth <= month && c.retainer.lastMonth !== month
  )
  if (!rows.length) return result
  const [settings, staff] = await Promise.all([getAppSettings(), find(users, { where: [['role', 'in', ['admin', 'manager']]] })])
  const staffIds = staff.filter((u) => !u.deletedAt && u.status !== 'inactive').map((u) => u.id)

  for (const c of rows) {
    if (opts.dryRun) {
      result.created.push(c.name)
      continue
    }
    try {
      const inv = await issueRetainerInvoice(c.id, month, 'system', date)
      if (!inv) continue
      result.created.push(inv.number)
      let emailedNote = ''
      if (c.retainer!.autoSend) {
        try {
          const to = await defaultInvoiceRecipients(c.id)
          if (to.length) {
            await sendInvoiceEmail({
              invoiceId: inv.id,
              doc: 'invoice',
              to: to.join(', '),
              subject: `Invoice ${inv.number} — ${settings.app_name}`,
              message: `Hello ${c.name},\n\nPlease find invoice ${inv.number} for ${formatMoney(inv.total, inv.currency)} below, due on ${dayjs(inv.dueDate).format('D MMM YYYY')}.\n\nLet us know if you have any questions.`,
            })
            result.emailed.push(inv.number)
            emailedNote = ' and emailed'
          } else {
            emailedNote = ' (no billing email to send it to)'
          }
        } catch (e) {
          console.error('[retainer] email failed', inv.number, e)
          emailedNote = ' (email failed: send it from the invoice page)'
        }
      }
      await notifyUsers({
        recipientUserIds: staffIds,
        type: 'retainer_invoiced',
        href: `/invoices/${inv.id}`,
        label: inv.number,
        title: 'Retainer invoice created',
        body: `${inv.number} for ${c.name} (${formatMoney(inv.total, inv.currency)}, ${monthLabel(month)}) was created${emailedNote}`,
      })
    } catch (e) {
      console.error('[retainer] failed for', c.name, e)
      result.failed.push(c.name)
    }
  }
  return result
}
