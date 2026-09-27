/**
 * Invoices: a snapshot of a company's billable time × hourly rate for a period, in one currency.
 * Lines are stored on the invoice so it reads (and downloads) the same later, whatever happens to the tickets.
 * Marking it paid records a company payment (reference = invoice number); marking it unpaid removes that payment.
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

/** Billable, priced time per ticket of one company, in one currency, for [from, to] (inclusive dates). */
export async function invoiceLinesFor(companyId: string, from: string, to: string, currency: string): Promise<InvoiceLine[]> {
  const start = dayjs(from).startOf('day')
  const end = dayjs(to).endOf('day')
  const [companyTickets, jobTypeRows] = await Promise.all([
    find(tickets, { where: [['companyId', '==', companyId]], select: ['id', 'title', 'hourlyRate', 'rateCurrency'] }),
    find(jobTypes),
  ])
  const priced = companyTickets.filter((t) => t.hourlyRate != null && (t.rateCurrency ?? 'IDR') === currency)
  if (!priced.length) return []
  const billableJob = new Map(jobTypeRows.map((j) => [j.slug, j.billable !== false]))
  const sessions = await find(ticketTimeTracker, {
    where: [['ticketId', 'in', priced.map((t) => t.id)]],
    select: ['id', 'ticketId', 'jobType', 'startTime', 'stopTime', 'durationSeconds', 'durationAdjustment'],
  })
  const secondsByTicket = new Map<number, number>()
  for (const s of sessions) {
    if (!s.stopTime || !s.jobType || !billableJob.get(s.jobType)) continue
    const at = dayjs(s.startTime)
    if (at.isBefore(start) || at.isAfter(end)) continue
    secondsByTicket.set(s.ticketId, (secondsByTicket.get(s.ticketId) ?? 0) + reportedDurationSeconds(s))
  }
  return priced
    .filter((t) => (secondsByTicket.get(t.id) ?? 0) > 0)
    .map((t) => {
      const seconds = secondsByTicket.get(t.id)!
      const rate = t.hourlyRate!
      return { ticketId: t.id, title: t.title, seconds, rate, amount: Math.round((seconds / 3600) * rate * 100) / 100 }
    })
    .sort((a, b) => a.ticketId - b.ticketId)
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
  if (!lines.length) throw new Error('No billable, priced time for this company and currency in the period')
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

export async function setInvoicePaid(id: string, paid: boolean, userId: string): Promise<InvoicesRow | null> {
  const inv = await get(invoices, id)
  if (!inv || inv.status === 'void') return inv
  if (paid && inv.status !== 'paid') {
    const payment = await insert(companyPayments, {
      companyId: inv.companyId,
      amount: inv.total,
      currency: inv.currency,
      paidAt: new Date(),
      reference: inv.number,
      note: 'Invoice marked as paid',
      createdBy: userId,
    })
    return update(invoices, id, { status: 'paid', paymentId: payment.id, updatedAt: new Date() })
  }
  if (!paid && inv.status === 'paid') {
    if (inv.paymentId) await remove(companyPayments, inv.paymentId)
    return update(invoices, id, { status: 'issued', paymentId: null, updatedAt: new Date() })
  }
  return inv
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
    created_at: new Date(inv.createdAt).toISOString(),
  }
}

export async function companyName(companyId: string): Promise<string | null> {
  return (await get(companies, companyId))?.name ?? null
}
