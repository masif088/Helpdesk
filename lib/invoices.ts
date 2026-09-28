/**
 * Invoices: we bill a client for billable time × hourly rate in a period (one currency per invoice).
 * Lines are stored on the invoice so it reads (and downloads) the same later, whatever happens to the tickets.
 *
 * Money model per company and currency:
 *   payments        = money received (deposits / top-ups, or a payment for an invoice)
 *   deposit balance = payments − paid invoices
 * An invoice is settled either from the deposit balance (no new money) or with a new payment (recorded, so the
 * balance does not change). A paid invoice also has a receipt (proof of payment) with the balance after it.
 */
import dayjs from 'dayjs'

import {
  companies,
  companyPayments,
  find,
  get,
  insert,
  type InvoiceLine,
  invoices,
  type InvoicesRow,
  jobTypes,
  remove,
  tickets,
  ticketTimeTracker,
  update,
} from '@/lib/fsdb'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

/**
 * Billable, priced time per ticket of one company, in one currency, for [from, to] (inclusive dates).
 * Sessions already on another (non-void) invoice are left out, so work is never billed twice.
 * Fixed-price tickets created up to `to` are one line each (their price, whatever the hours), billed once.
 */
export async function invoiceLinesFor(companyId: string, from: string, to: string, currency: string): Promise<InvoiceLine[]> {
  const start = dayjs(from).startOf('day')
  const end = dayjs(to).endOf('day')
  const [companyTickets, jobTypeRows, existing] = await Promise.all([
    find(tickets, { where: [['companyId', '==', companyId]], select: ['id', 'title', 'hourlyRate', 'rateCurrency', 'fixedPrice', 'createdAt'] }),
    find(jobTypes),
    find(invoices, { where: [['companyId', '==', companyId]], select: ['status', 'lines'] }),
  ])
  const alreadyBilled = new Set(existing.filter((i) => i.status !== 'void').flatMap((i) => i.lines.flatMap((l) => l.sessionIds ?? [])))
  const fixedBilled = new Set(existing.filter((i) => i.status !== 'void').flatMap((i) => i.lines.filter((l) => l.fixed).map((l) => l.ticketId)))
  const fixedLines: InvoiceLine[] = companyTickets
    .filter((t) => t.fixedPrice != null && (t.rateCurrency ?? 'IDR') === currency && !fixedBilled.has(t.id) && !dayjs(t.createdAt).isAfter(end))
    .map((t) => ({ ticketId: t.id, title: t.title, seconds: 0, rate: t.fixedPrice!, amount: t.fixedPrice!, fixed: true }))
  const priced = companyTickets.filter((t) => t.fixedPrice == null && t.hourlyRate != null && (t.rateCurrency ?? 'IDR') === currency)
  if (!priced.length) return fixedLines
  const billableJob = new Map(jobTypeRows.map((j) => [j.slug, j.billable !== false]))
  const sessions = await find(ticketTimeTracker, {
    where: [['ticketId', 'in', priced.map((t) => t.id)]],
    select: ['id', 'ticketId', 'jobType', 'startTime', 'stopTime', 'durationSeconds', 'durationAdjustment'],
  })
  const secondsByTicket = new Map<number, number>()
  const sessionsByTicket = new Map<number, string[]>()
  for (const s of sessions) {
    if (!s.stopTime || !s.jobType || !billableJob.get(s.jobType) || alreadyBilled.has(s.id)) continue
    const at = dayjs(s.startTime)
    if (at.isBefore(start) || at.isAfter(end)) continue
    secondsByTicket.set(s.ticketId, (secondsByTicket.get(s.ticketId) ?? 0) + reportedDurationSeconds(s))
    sessionsByTicket.set(s.ticketId, [...(sessionsByTicket.get(s.ticketId) ?? []), s.id])
  }
  const hourlyLines = priced
    .filter((t) => (secondsByTicket.get(t.id) ?? 0) > 0)
    .map((t) => {
      const seconds = secondsByTicket.get(t.id)!
      const rate = t.hourlyRate!
      return {
        ticketId: t.id,
        title: t.title,
        seconds,
        rate,
        amount: Math.round((seconds / 3600) * rate * 100) / 100,
        sessionIds: sessionsByTicket.get(t.id) ?? [],
      }
    })
  return [...hourlyLines, ...fixedLines].sort((a, b) => a.ticketId - b.ticketId)
}

/** Next number for the year of the issue date: INV-2026-0001, INV-2026-0002, … */
async function nextInvoiceNumber(issueDate: string): Promise<string> {
  const year = dayjs(issueDate).year()
  const prefix = `INV-${year}-`
  const rows = await find(invoices, { select: ['number'] })
  const max = rows
    .map((r) => (r.number.startsWith(prefix) ? Number(r.number.slice(prefix.length)) : 0))
    .reduce((m, n) => (Number.isFinite(n) && n > m ? n : m), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function createInvoice(params: {
  companyId: string
  from: string
  to: string
  currency: string
  issueDate: string
  dueDate: string | null
  notes: string | null
  createdBy: string
}): Promise<InvoicesRow> {
  const lines = await invoiceLinesFor(params.companyId, params.from, params.to, params.currency)
  if (!lines.length) throw new Error('Nothing to bill for this company and currency in the period')
  const total = Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100
  return insert(invoices, {
    number: await nextInvoiceNumber(params.issueDate),
    companyId: params.companyId,
    currency: params.currency,
    periodFrom: params.from,
    periodTo: params.to,
    issueDate: params.issueDate,
    dueDate: params.dueDate,
    lines,
    total,
    status: 'issued',
    notes: params.notes,
    createdBy: params.createdBy,
  })
}

/** Deposit balance per currency: payments received − invoices already paid. */
export async function companyDepositBalance(companyId: string, excludeInvoiceId?: string): Promise<Map<string, number>> {
  const [payments, invs] = await Promise.all([
    find(companyPayments, { where: [['companyId', '==', companyId]] }),
    find(invoices, { where: [['companyId', '==', companyId]] }),
  ])
  const bal = new Map<string, number>()
  for (const p of payments) bal.set(p.currency, (bal.get(p.currency) ?? 0) + p.amount)
  for (const i of invs) {
    if (i.status !== 'paid' || i.id === excludeInvoiceId) continue
    bal.set(i.currency, (bal.get(i.currency) ?? 0) - i.total)
  }
  for (const [c, v] of bal) bal.set(c, Math.round(v * 100) / 100)
  return bal
}

export class InvoiceError extends Error {}

/**
 * Settle an issued invoice.
 *   via 'balance' — take it from the deposit balance (must cover the total)
 *   via 'payment' — record a new payment for it (reference = invoice number, optional note)
 */
export async function payInvoice(id: string, via: 'balance' | 'payment', userId: string, reference?: string | null): Promise<InvoicesRow> {
  const inv = await get(invoices, id)
  if (!inv) throw new InvoiceError('Invoice not found')
  if (inv.status !== 'issued') throw new InvoiceError(`This invoice is ${inv.status}`)
  const paidAt = dayjs().format('YYYY-MM-DD')
  if (via === 'balance') {
    const available = (await companyDepositBalance(inv.companyId, id)).get(inv.currency) ?? 0
    if (available + 0.005 < inv.total) throw new InvoiceError('The deposit balance does not cover this invoice')
    const balanceAfter = Math.round((available - inv.total) * 100) / 100
    return (await update(invoices, id, { status: 'paid', paidVia: 'balance', paidAt, balanceAfter, updatedAt: new Date() }))!
  }
  const payment = await insert(companyPayments, {
    companyId: inv.companyId,
    amount: inv.total,
    currency: inv.currency,
    paidAt: new Date(),
    reference: reference?.trim() || inv.number,
    note: `Payment for ${inv.number}`,
    createdBy: userId,
  })
  const balanceAfter = (await companyDepositBalance(inv.companyId, id)).get(inv.currency) ?? 0
  return (await update(invoices, id, {
    status: 'paid',
    paidVia: 'payment',
    paymentId: payment.id,
    paidAt,
    balanceAfter: Math.round((balanceAfter - inv.total) * 100) / 100,
    updatedAt: new Date(),
  }))!
}

/** Undo a settlement: back to issued (a payment recorded for it is removed). */
export async function unpayInvoice(id: string): Promise<InvoicesRow> {
  const inv = await get(invoices, id)
  if (!inv) throw new InvoiceError('Invoice not found')
  if (inv.status !== 'paid') return inv
  if (inv.paymentId) await remove(companyPayments, inv.paymentId)
  return (await update(invoices, id, { status: 'issued', paidVia: null, paymentId: null, paidAt: null, balanceAfter: null, updatedAt: new Date() }))!
}

export function invoiceToJson(inv: InvoicesRow, companyName?: string | null) {
  return {
    id: inv.id,
    number: inv.number,
    company_id: inv.companyId,
    company_name: companyName ?? null,
    currency: inv.currency,
    period_from: inv.periodFrom,
    period_to: inv.periodTo,
    issue_date: inv.issueDate,
    due_date: inv.dueDate,
    lines: inv.lines,
    total: inv.total,
    status: inv.status,
    notes: inv.notes,
    paid_via: inv.paidVia ?? null,
    paid_at: inv.paidAt ?? null,
    balance_after: inv.balanceAfter ?? null,
    created_at: new Date(inv.createdAt).toISOString(),
  }
}

export async function companyName(companyId: string): Promise<string | null> {
  return (await get(companies, companyId))?.name ?? null
}
