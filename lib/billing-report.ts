/**
 * Billing report across companies for a period: billable time × each ticket's hourly rate = billed,
 * payments recorded in the period = paid, and the all-time balance (billed − paid) per company.
 * Amounts stay per currency (tickets may be IDR or USD).
 */
import dayjs from 'dayjs'

import type { Money } from '@/lib/company-billing'
import { companies, companyPayments, find, jobTypes, tickets, ticketTimeTracker } from '@/lib/fsdb'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

export type BillingReportCompany = {
  companyId: string | null
  name: string
  color: string | null
  billableSeconds: number
  internalSeconds: number
  /** Billable time on tickets without an hourly rate (not in `billed`) */
  unpricedSeconds: number
  billed: Money[]
  paid: Money[]
  /** All time: billed − paid (positive = client owes) */
  balance: Money[]
}

export type BillingReport = {
  from: string
  to: string
  totals: { billed: Money[]; paid: Money[]; balance: Money[]; billableSeconds: number; internalSeconds: number; unpricedSeconds: number }
  companies: BillingReportCompany[]
  /** Billable hours per month in the period, for the trend */
  months: { month: string; billableSeconds: number; billed: Money[] }[]
}

type Acc = { billableSeconds: number; internalSeconds: number; unpricedSeconds: number; billed: Map<string, number>; paid: Map<string, number>; allBilled: Map<string, number>; allPaid: Map<string, number> }

const add = (m: Map<string, number>, cur: string, v: number) => m.set(cur, (m.get(cur) ?? 0) + v)
const toMoney = (m: Map<string, number>): Money[] =>
  [...m.entries()]
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
const diff = (a: Map<string, number>, b: Map<string, number>) => {
  const out = new Map<string, number>()
  for (const c of new Set([...a.keys(), ...b.keys()])) out.set(c, (a.get(c) ?? 0) - (b.get(c) ?? 0))
  return out
}

/** `from` / `to` are inclusive dates (YYYY-MM-DD). */
export async function getBillingReport(from: string, to: string): Promise<BillingReport> {
  const start = dayjs(from).startOf('day')
  const end = dayjs(to).endOf('day')

  const [ticketRows, jobTypeRows, companyRows, payments, sessions] = await Promise.all([
    find(tickets, { select: ['id', 'companyId', 'hourlyRate', 'rateCurrency'] }),
    find(jobTypes),
    find(companies, { select: ['id', 'name', 'color'] }),
    find(companyPayments),
    // All stopped sessions: the period is filtered here, the all-time balance needs the rest
    find(ticketTimeTracker, { select: ['id', 'ticketId', 'jobType', 'startTime', 'stopTime', 'durationSeconds', 'durationAdjustment'] }),
  ])
  const billableJob = new Map(jobTypeRows.map((j) => [j.slug, j.billable !== false]))
  const ticketById = new Map(ticketRows.map((t) => [t.id, t]))
  const companyById = new Map(companyRows.map((c) => [c.id, c]))

  const accs = new Map<string, Acc>()
  const acc = (key: string) => {
    let a = accs.get(key)
    if (!a) {
      a = { billableSeconds: 0, internalSeconds: 0, unpricedSeconds: 0, billed: new Map(), paid: new Map(), allBilled: new Map(), allPaid: new Map() }
      accs.set(key, a)
    }
    return a
  }
  const months = new Map<string, { seconds: number; money: Map<string, number> }>()

  for (const s of sessions) {
    if (!s.stopTime) continue
    const t = ticketById.get(s.ticketId)
    if (!t) continue
    const key = t.companyId ?? '__none__'
    const a = acc(key)
    const secs = reportedDurationSeconds(s)
    const inPeriod = !dayjs(s.startTime).isBefore(start) && !dayjs(s.startTime).isAfter(end)
    const billable = !!s.jobType && !!billableJob.get(s.jobType)
    if (!billable) {
      if (inPeriod) a.internalSeconds += secs
      continue
    }
    const amount = t.hourlyRate != null ? (secs / 3600) * t.hourlyRate : null
    const cur = t.rateCurrency ?? 'IDR'
    if (amount != null) add(a.allBilled, cur, amount)
    if (!inPeriod) continue
    a.billableSeconds += secs
    const month = dayjs(s.startTime).format('YYYY-MM')
    const m = months.get(month) ?? { seconds: 0, money: new Map<string, number>() }
    m.seconds += secs
    months.set(month, m)
    if (amount == null) {
      a.unpricedSeconds += secs
      continue
    }
    add(a.billed, cur, amount)
    add(m.money, cur, amount)
  }

  for (const p of payments) {
    const a = acc(p.companyId)
    add(a.allPaid, p.currency, p.amount)
    const at = dayjs(p.paidAt)
    if (!at.isBefore(start) && !at.isAfter(end)) add(a.paid, p.currency, p.amount)
  }

  const rows: BillingReportCompany[] = [...accs.entries()]
    .map(([key, a]) => {
      const c = key === '__none__' ? null : companyById.get(key)
      return {
        companyId: key === '__none__' ? null : key,
        name: key === '__none__' ? 'No company' : c?.name ?? 'Deleted company',
        color: c?.color ?? null,
        billableSeconds: a.billableSeconds,
        internalSeconds: a.internalSeconds,
        unpricedSeconds: a.unpricedSeconds,
        billed: toMoney(a.billed),
        paid: toMoney(a.paid),
        balance: toMoney(diff(a.allBilled, a.allPaid)),
      }
    })
    // Only companies with something to show for the period or an open balance
    .filter((r) => r.billableSeconds || r.internalSeconds || r.paid.length || r.balance.some((m) => m.amount !== 0))
    .sort((x, y) => y.billableSeconds - x.billableSeconds)

  const sum = (pick: (a: Acc) => Map<string, number>) => {
    const m = new Map<string, number>()
    for (const a of accs.values()) for (const [c, v] of pick(a)) add(m, c, v)
    return m
  }
  const all = [...accs.values()]
  return {
    from: start.format('YYYY-MM-DD'),
    to: end.format('YYYY-MM-DD'),
    totals: {
      billed: toMoney(sum((a) => a.billed)),
      paid: toMoney(sum((a) => a.paid)),
      balance: toMoney(diff(sum((a) => a.allBilled), sum((a) => a.allPaid))),
      billableSeconds: all.reduce((n, a) => n + a.billableSeconds, 0),
      internalSeconds: all.reduce((n, a) => n + a.internalSeconds, 0),
      unpricedSeconds: all.reduce((n, a) => n + a.unpricedSeconds, 0),
    },
    companies: rows,
    months: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, m]) => ({ month, billableSeconds: m.seconds, billed: toMoney(m.money) })),
  }
}
