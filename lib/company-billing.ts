/**
 * Company billing: billable time × each ticket's hourly rate = billed; recorded payments = paid;
 * billed − paid = outstanding. All amounts are kept per currency (tickets may be IDR or USD).
 */
import dayjs from 'dayjs'

import { companyPayments, find, getManyMap, jobTypes, tickets, ticketTimeTracker, users } from '@/lib/fsdb'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

export type Money = { currency: string; amount: number }

export type CompanyBilling = {
  billed: Money[]
  paid: Money[]
  outstanding: Money[]
  billableSeconds: number
  nonBillableSeconds: number
  /** Billable time on tickets without an hourly rate (not in `billed`). */
  unpricedSeconds: number
  /** Most recent months first */
  months: { month: string; billableSeconds: number; billed: Money[] }[]
  /** Tickets with the most billable time */
  tickets: { id: number; title: string; billableSeconds: number; rate: number | null; currency: string | null; billed: number | null }[]
  payments: {
    id: string
    amount: number
    currency: string
    paidAt: string
    reference: string | null
    note: string | null
    createdByName: string | null
  }[]
}

function addMoney(map: Map<string, number>, currency: string, amount: number) {
  map.set(currency, (map.get(currency) ?? 0) + amount)
}

function toMoney(map: Map<string, number>): Money[] {
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export async function getCompanyBilling(companyId: string): Promise<CompanyBilling> {
  const [companyTickets, jobTypeRows, paymentRows] = await Promise.all([
    find(tickets, {
      where: [['companyId', '==', companyId]],
      select: ['id', 'title', 'hourlyRate', 'rateCurrency'],
    }),
    find(jobTypes),
    find(companyPayments, { where: [['companyId', '==', companyId]], orderBy: [['paidAt', 'desc']] }),
  ])
  const billableJob = new Map(jobTypeRows.map((j) => [j.slug, j.billable !== false]))
  const ticketById = new Map(companyTickets.map((t) => [t.id, t]))

  const sessions = companyTickets.length
    ? await find(ticketTimeTracker, {
        where: [['ticketId', 'in', companyTickets.map((t) => t.id)]],
        select: ['id', 'ticketId', 'jobType', 'startTime', 'stopTime', 'durationSeconds', 'durationAdjustment'],
      })
    : []

  const billed = new Map<string, number>()
  const byMonth = new Map<string, { seconds: number; money: Map<string, number> }>()
  const byTicket = new Map<number, number>()
  let billableSeconds = 0
  let nonBillableSeconds = 0
  let unpricedSeconds = 0

  for (const s of sessions) {
    if (!s.stopTime) continue
    const secs = reportedDurationSeconds(s)
    if (!s.jobType || !billableJob.get(s.jobType)) {
      nonBillableSeconds += secs
      continue
    }
    billableSeconds += secs
    byTicket.set(s.ticketId, (byTicket.get(s.ticketId) ?? 0) + secs)
    const month = dayjs(s.startTime).format('YYYY-MM')
    const m = byMonth.get(month) ?? { seconds: 0, money: new Map<string, number>() }
    m.seconds += secs
    byMonth.set(month, m)
    const t = ticketById.get(s.ticketId)
    if (t?.hourlyRate == null) {
      unpricedSeconds += secs
      continue
    }
    const cur = t.rateCurrency ?? 'IDR'
    const amount = (secs / 3600) * t.hourlyRate
    addMoney(billed, cur, amount)
    addMoney(m.money, cur, amount)
  }

  const paid = new Map<string, number>()
  for (const p of paymentRows) addMoney(paid, p.currency, p.amount)
  const outstanding = new Map<string, number>()
  for (const cur of new Set([...billed.keys(), ...paid.keys()])) {
    outstanding.set(cur, (billed.get(cur) ?? 0) - (paid.get(cur) ?? 0))
  }

  const creatorMap = await getManyMap(users, [...new Set(paymentRows.map((p) => p.createdBy).filter((x): x is string => !!x))])

  return {
    billed: toMoney(billed),
    paid: toMoney(paid),
    outstanding: toMoney(outstanding),
    billableSeconds,
    nonBillableSeconds,
    unpricedSeconds,
    months: [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([month, m]) => ({ month, billableSeconds: m.seconds, billed: toMoney(m.money) })),
    tickets: [...byTicket.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, secs]) => {
        const t = ticketById.get(id)
        const rate = t?.hourlyRate ?? null
        return {
          id,
          title: t?.title ?? `#${id}`,
          billableSeconds: secs,
          rate,
          currency: t?.rateCurrency ?? null,
          billed: rate == null ? null : Math.round((secs / 3600) * rate * 100) / 100,
        }
      }),
    payments: paymentRows.map((p) => {
      const u = p.createdBy ? creatorMap.get(p.createdBy) : undefined
      return {
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        paidAt: p.paidAt.toISOString(),
        reference: p.reference ?? null,
        note: p.note ?? null,
        createdByName: u ? u.fullName || u.email : null,
      }
    }),
  }
}
