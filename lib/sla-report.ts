/**
 * Service quality for a period (support tickets only):
 *   SLA          = tickets created in the period that have a target: answered / resolved in time, late, or still running
 *   at risk now  = open tickets (any age) whose clock is about to run out or has
 *   satisfaction = client ratings given in the period
 */
import dayjs from 'dayjs'

import {
  companies,
  find,
  getManyMap,
  ticketActivityLog,
  ticketAssignees,
  ticketComments,
  tickets,
  ticketTypes,
  users,
} from '@/lib/fsdb'
import {
  computeSla,
  FINISHED_STATUSES,
  finishedAtFromLog,
  firstResponseAt,
  firstTeamReply,
  loadSlaContext,
  slaTargetFor,
  ticketsOpenedByClient,
} from '@/lib/sla'
import type { SlaClock } from '@/lib/sla-format'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

const CLOSED_LIKE = ['resolved', 'closed', 'completed', 'cancel', 'archived', 'pending']

export type Compliance = { met: number; missed: number; breached: number; running: number }
const empty = (): Compliance => ({ met: 0, missed: 0, breached: 0, running: 0 })

export type SlaGroupRow = { key: string; name: string; color: string | null; tickets: number; respond: Compliance; resolve: Compliance }

export type SlaAtRisk = {
  ticketId: number
  title: string
  company: string | null
  clock: 'respond' | 'resolve'
  state: 'breached' | 'at_risk'
  /** Seconds left; negative when overdue */
  remainingSeconds: number
  targetMinutes: number
}

export type CsatRow = { key: string; name: string; responses: number; average: number }

export type SlaReport = {
  from: string
  to: string
  totals: { tickets: number; respond: Compliance; resolve: Compliance }
  byCompany: SlaGroupRow[]
  byType: SlaGroupRow[]
  atRisk: SlaAtRisk[]
  csat: {
    responses: number
    average: number | null
    /** Ratings 1..5 */
    distribution: number[]
    byAgent: CsatRow[]
    byCompany: CsatRow[]
    /** Ratings of 3 or less with a comment, newest first */
    lowComments: { ticketId: number; title: string; company: string | null; rating: number; comment: string; at: string }[]
  }
}

function tally(c: Compliance, clock: SlaClock | null) {
  if (!clock) return
  if (clock.state === 'met') c.met++
  else if (clock.state === 'missed') c.missed++
  else if (clock.state === 'breached') c.breached++
  else c.running++
}

const avg = (values: number[]) => (values.length ? Math.round((values.reduce((n, v) => n + v, 0) / values.length) * 100) / 100 : 0)

/** `from` / `to` are inclusive dates (YYYY-MM-DD). */
export async function getSlaReport(from: string, to: string): Promise<SlaReport> {
  const start = dayjs(from).startOf('day')
  const end = dayjs(to).endOf('day')

  const [ctx, periodRows, openRows, ratedRows, commentRows, logRows, companyRows, typeRows, assigneeRows] = await Promise.all([
    loadSlaContext(),
    find(tickets, { where: [['createdAt', '>=', start.toDate()], ['createdAt', '<=', end.toDate()]] }),
    find(tickets, { where: [['ticketType', '==', DEFAULT_TICKET_TYPE], ['status', 'not-in', CLOSED_LIKE]] }),
    find(tickets, { where: [['csatAt', '>=', start.toDate()], ['csatAt', '<=', end.toDate()]] }),
    find(ticketComments, { where: [['createdAt', '>=', start.toDate()]], select: ['ticketId', 'authorType', 'visibility', 'createdAt'] }),
    find(ticketActivityLog, { where: [['createdAt', '>=', start.toDate()]], select: ['ticketId', 'action', 'metadata', 'createdAt'] }),
    find(companies, { select: ['id', 'name', 'color'] }),
    find(ticketTypes, { select: ['id', 'title', 'color'] }),
    find(ticketAssignees, { select: ['ticketId', 'userId'] }),
  ])
  const companyById = new Map(companyRows.map((c) => [c.id, c]))
  const typeById = new Map(typeRows.map((t) => [t.id, t]))

  const period = periodRows.filter((t) => (t.ticketType ?? DEFAULT_TICKET_TYPE) === DEFAULT_TICKET_TYPE)
  const opened = await ticketsOpenedByClient([...period, ...openRows])

  const repliesByTicket = new Map<number, typeof commentRows>()
  for (const c of commentRows) repliesByTicket.set(c.ticketId, [...(repliesByTicket.get(c.ticketId) ?? []), c])
  const logByTicket = new Map<number, typeof logRows>()
  for (const l of logRows) if (l.ticketId != null) logByTicket.set(l.ticketId, [...(logByTicket.get(l.ticketId) ?? []), l])

  // --- compliance for tickets created in the period
  const totals = { tickets: 0, respond: empty(), resolve: empty() }
  const companyGroups = new Map<string, SlaGroupRow>()
  const typeGroups = new Map<string, SlaGroupRow>()
  const group = (m: Map<string, SlaGroupRow>, key: string, name: string, color: string | null) => {
    let g = m.get(key)
    if (!g) {
      g = { key, name, color, tickets: 0, respond: empty(), resolve: empty() }
      m.set(key, g)
    }
    return g
  }
  for (const t of period) {
    const target = slaTargetFor(ctx, t)
    if (!target) continue
    const finished = FINISHED_STATUSES.has(t.status)
    const sla = computeSla(t, target, {
      openedByClient: opened.has(t.id),
      firstReplyAt: t.firstRespondedAt ? new Date(t.firstRespondedAt) : firstTeamReply(repliesByTicket.get(t.id) ?? []),
      finishedAt: finished ? (finishedAtFromLog(logByTicket.get(t.id) ?? []) ?? t.updatedAt) : null,
    })
    if (!sla.respond && !sla.resolve) continue
    totals.tickets++
    tally(totals.respond, sla.respond)
    tally(totals.resolve, sla.resolve)
    const company = t.companyId ? companyById.get(t.companyId) : null
    const type = t.typeId != null ? typeById.get(t.typeId) : null
    for (const g of [
      group(companyGroups, t.companyId ?? '__none__', company?.name ?? 'No company', company?.color ?? null),
      group(typeGroups, t.typeId != null ? String(t.typeId) : '__none__', type?.title ?? 'No type', type?.color ?? null),
    ]) {
      g.tickets++
      tally(g.respond, sla.respond)
      tally(g.resolve, sla.resolve)
    }
  }
  const worst = (a: SlaGroupRow, b: SlaGroupRow) => b.respond.missed + b.respond.breached + b.resolve.missed + b.resolve.breached - (a.respond.missed + a.respond.breached + a.resolve.missed + a.resolve.breached) || b.tickets - a.tickets

  // --- open tickets whose clock is about to run out or has
  const atRisk: SlaAtRisk[] = []
  for (const t of openRows) {
    const target = slaTargetFor(ctx, t)
    if (!target) continue
    const needsReply = target.respond != null && opened.has(t.id) && !t.firstRespondedAt
    const sla = computeSla(t, target, {
      openedByClient: opened.has(t.id),
      firstReplyAt: needsReply ? await firstResponseAt(t) : t.firstRespondedAt ? new Date(t.firstRespondedAt) : null,
      finishedAt: null,
    })
    for (const [name, c] of [['respond', sla.respond], ['resolve', sla.resolve]] as const) {
      if (!c || c.doneAt || (c.state !== 'breached' && c.state !== 'at_risk')) continue
      atRisk.push({
        ticketId: t.id,
        title: t.title,
        company: t.companyId ? (companyById.get(t.companyId)?.name ?? null) : null,
        clock: name,
        state: c.state,
        remainingSeconds: c.remainingSeconds ?? 0,
        targetMinutes: c.targetMinutes,
      })
    }
  }
  atRisk.sort((a, b) => a.remainingSeconds - b.remainingSeconds)

  // --- client satisfaction
  const rated = ratedRows.filter((t) => t.csatRating)
  const assigneesByTicket = new Map<number, string[]>()
  for (const a of assigneeRows) assigneesByTicket.set(a.ticketId, [...(assigneesByTicket.get(a.ticketId) ?? []), a.userId])
  const people = await getManyMap(users, [...new Set(rated.flatMap((t) => assigneesByTicket.get(t.id) ?? []))])
  const distribution = [0, 0, 0, 0, 0]
  const byAgent = new Map<string, number[]>()
  const byCompany = new Map<string, number[]>()
  for (const t of rated) {
    const r = t.csatRating!
    distribution[r - 1]++
    for (const uid of assigneesByTicket.get(t.id) ?? []) byAgent.set(uid, [...(byAgent.get(uid) ?? []), r])
    const ck = t.companyId ?? '__none__'
    byCompany.set(ck, [...(byCompany.get(ck) ?? []), r])
  }
  const rows = (m: Map<string, number[]>, name: (k: string) => string): CsatRow[] =>
    [...m.entries()].map(([key, v]) => ({ key, name: name(key), responses: v.length, average: avg(v) })).sort((a, b) => b.responses - a.responses || b.average - a.average)

  return {
    from: start.format('YYYY-MM-DD'),
    to: end.format('YYYY-MM-DD'),
    totals,
    byCompany: [...companyGroups.values()].sort(worst),
    byType: [...typeGroups.values()].sort(worst),
    atRisk: atRisk.slice(0, 50),
    csat: {
      responses: rated.length,
      average: rated.length ? avg(rated.map((t) => t.csatRating!)) : null,
      distribution,
      byAgent: rows(byAgent, (k) => people.get(k)?.fullName || people.get(k)?.email || 'Unknown'),
      byCompany: rows(byCompany, (k) => (k === '__none__' ? 'No company' : (companyById.get(k)?.name ?? 'Deleted company'))),
      lowComments: rated
        .filter((t) => t.csatRating! <= 3 && t.csatComment)
        .sort((a, b) => new Date(b.csatAt!).getTime() - new Date(a.csatAt!).getTime())
        .slice(0, 20)
        .map((t) => ({
          ticketId: t.id,
          title: t.title,
          company: t.companyId ? (companyById.get(t.companyId)?.name ?? null) : null,
          rating: t.csatRating!,
          comment: t.csatComment!,
          at: new Date(t.csatAt!).toISOString(),
        })),
    },
  }
}
