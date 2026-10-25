/**
 * Service quality for a period (support tickets only):
 *   SLA          = tickets created in the period that have a target: answered / resolved in time, late, or still running
 *   at risk now  = open tickets (any age) whose clock is about to run out or has
 *   satisfaction = client ratings given in the period
 *
 * A report is the sum of one stored summary per day (lib/sla-daily.ts, collection `sla_daily`). Only days that are missing or can
 * still change are built from tickets; a settled day is read as one small document, however often it is asked for.
 */
import dayjs from 'dayjs'

import {
  companies,
  find,
  getMany,
  getManyMap,
  slaDaily,
  ticketActivityLog,
  ticketAssignees,
  ticketComments,
  tickets,
  ticketTypes,
  upsert,
  users,
} from '@/lib/fsdb'
import {
  computeSla,
  FINISHED_STATUSES,
  finishedAtFromLog,
  firstResponseAt,
  firstTeamReply,
  loadSlaContext,
  type SlaContext,
  slaTargetFor,
  slaTimeFor,
  slaTimesFor,
  ticketsOpenedByClient,
} from '@/lib/sla'
import {
  addAgg,
  csatDayIsFinal,
  datesBetween,
  type DayCsat,
  type DayGroup,
  dayNeedsBuild,
  type DaySla,
  emptyDayCsat,
  emptyDaySla,
  emptyGroup,
  mergeCsat,
  mergeSla,
  slaDayIsFinal,
  type StoredDay,
  type Tally,
} from '@/lib/sla-daily'
import type { SlaClock } from '@/lib/sla-format'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { CLOSED_LIKE_TICKET_STATUSES } from '@/lib/ticket-status-workflow'

export type Compliance = Tally

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

function tally(c: Tally, clock: SlaClock | null) {
  if (!clock) return
  if (clock.state === 'met') c.met++
  else if (clock.state === 'missed') c.missed++
  else if (clock.state === 'breached') c.breached++
  else c.running++
}

const avg = (sum: number, n: number) => (n ? Math.round((sum / n) * 100) / 100 : 0)
const dayOf = (d: Date | string) => dayjs(d).format('YYYY-MM-DD')
const bump = (g: DayGroup, respond: SlaClock | null, resolve: SlaClock | null) => {
  g.tickets++
  tally(g.respond, respond)
  tally(g.resolve, resolve)
}

const IN_LIMIT = 30
const chunks = <T>(list: T[], size = IN_LIMIT) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

/**
 * Build the summaries of these days from the tickets. One query for the tickets of the whole span, then comments and activity
 * only for the tickets that need them.
 */
async function buildDays(dates: string[], ctx: SlaContext): Promise<Map<string, { sla: DaySla; csat: DayCsat }>> {
  const wanted = new Set(dates)
  const sorted = [...dates].sort()
  const start = dayjs(sorted[0]).startOf('day').toDate()
  const end = dayjs(sorted[sorted.length - 1]).endOf('day').toDate()
  const out = new Map(dates.map((d) => [d, { sla: emptyDaySla(), csat: emptyDayCsat() }]))

  const [createdRows, ratedRows] = await Promise.all([
    find(tickets, { where: [['createdAt', '>=', start], ['createdAt', '<=', end]] }),
    find(tickets, { where: [['csatAt', '>=', start], ['csatAt', '<=', end]] }),
  ])

  // --- SLA, by the day the ticket was created
  const support = createdRows.filter((t) => (t.ticketType ?? DEFAULT_TICKET_TYPE) === DEFAULT_TICKET_TYPE && wanted.has(dayOf(t.createdAt)) && slaTargetFor(ctx, t))
  const opened = await ticketsOpenedByClient(support)
  const needReplies = support.filter((t) => !t.firstRespondedAt && opened.has(t.id)).map((t) => t.id)
  // Activity is read for finished tickets (when they finished) and, when pauses apply, for every ticket
  const needLog = support.filter((t) => ctx.waiting.size > 0 || FINISHED_STATUSES.has(t.status)).map((t) => t.id)
  const [commentRows, logRows] = await Promise.all([
    Promise.all(chunks(needReplies).map((ids) => find(ticketComments, { where: [['ticketId', 'in', ids]], select: ['ticketId', 'authorType', 'visibility', 'createdAt'] }))).then((r) => r.flat()),
    Promise.all(chunks(needLog).map((ids) => find(ticketActivityLog, { where: [['ticketId', 'in', ids]], select: ['ticketId', 'action', 'metadata', 'createdAt'] }))).then((r) => r.flat()),
  ])
  const repliesByTicket = new Map<number, typeof commentRows>()
  for (const c of commentRows) repliesByTicket.set(c.ticketId, [...(repliesByTicket.get(c.ticketId) ?? []), c])
  const logByTicket = new Map<number, typeof logRows>()
  for (const l of logRows) if (l.ticketId != null) logByTicket.set(l.ticketId, [...(logByTicket.get(l.ticketId) ?? []), l])

  for (const t of support) {
    const target = slaTargetFor(ctx, t)
    if (!target) continue
    const finished = FINISHED_STATUSES.has(t.status)
    const sla = computeSla(t, target, {
      openedByClient: opened.has(t.id),
      firstReplyAt: t.firstRespondedAt ? new Date(t.firstRespondedAt) : firstTeamReply(repliesByTicket.get(t.id) ?? []),
      finishedAt: finished ? (finishedAtFromLog(logByTicket.get(t.id) ?? []) ?? t.updatedAt) : null,
      ...slaTimeFor(ctx, t, logByTicket.get(t.id) ?? []),
    })
    if (!sla.respond && !sla.resolve) continue
    const day = out.get(dayOf(t.createdAt))!.sla
    bump(day, sla.respond, sla.resolve)
    bump((day.byCompany[t.companyId ?? '_none'] ??= emptyGroup()), sla.respond, sla.resolve)
    bump((day.byType[t.typeId != null ? String(t.typeId) : '_none'] ??= emptyGroup()), sla.respond, sla.resolve)
  }

  // --- satisfaction, by the day the rating was given
  const rated = ratedRows.filter((t) => t.csatRating && t.csatAt && wanted.has(dayOf(t.csatAt)))
  const assigneeRows = (await Promise.all(chunks(rated.map((t) => t.id)).map((ids) => find(ticketAssignees, { where: [['ticketId', 'in', ids]], select: ['ticketId', 'userId'] })))).flat()
  const assigneesByTicket = new Map<number, string[]>()
  for (const a of assigneeRows) assigneesByTicket.set(a.ticketId, [...(assigneesByTicket.get(a.ticketId) ?? []), a.userId])
  for (const t of rated) {
    const r = t.csatRating!
    const day = out.get(dayOf(t.csatAt!))!.csat
    day.n++
    day.sum += r
    day.dist[r - 1]++
    for (const uid of assigneesByTicket.get(t.id)?.length ? assigneesByTicket.get(t.id)! : ['_none']) addAgg(day.byAgent, uid, 1, r)
    addAgg(day.byCompany, t.companyId ?? '_none', 1, r)
    if (r <= 3 && t.csatComment) day.low.push({ ticketId: t.id, title: t.title, companyId: t.companyId ?? null, rating: r, comment: t.csatComment, at: new Date(t.csatAt!).toISOString() })
  }
  for (const d of out.values()) d.csat.low = d.csat.low.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20)
  return out
}

/** Open tickets (any age) whose clock is about to run out or has: always "now", never stored. */
async function atRiskNow(ctx: SlaContext, companyName: (id: string | null) => string | null): Promise<SlaAtRisk[]> {
  const openRows = await find(tickets, { where: [['ticketType', '==', DEFAULT_TICKET_TYPE], ['status', 'not-in', CLOSED_LIKE_TICKET_STATUSES]] })
  const opened = await ticketsOpenedByClient(openRows)
  const atRisk: SlaAtRisk[] = []
  const times = await slaTimesFor(ctx, openRows.filter((t) => slaTargetFor(ctx, t)))
  for (const t of openRows) {
    const target = slaTargetFor(ctx, t)
    if (!target) continue
    const needsReply = target.respond != null && opened.has(t.id) && !t.firstRespondedAt
    const sla = computeSla(t, target, {
      openedByClient: opened.has(t.id),
      firstReplyAt: needsReply ? await firstResponseAt(t) : t.firstRespondedAt ? new Date(t.firstRespondedAt) : null,
      finishedAt: null,
      ...times.get(t.id),
    })
    for (const [name, c] of [['respond', sla.respond], ['resolve', sla.resolve]] as const) {
      if (!c || c.doneAt || (c.state !== 'breached' && c.state !== 'at_risk')) continue
      atRisk.push({ ticketId: t.id, title: t.title, company: companyName(t.companyId ?? null), clock: name, state: c.state, remainingSeconds: c.remainingSeconds ?? 0, targetMinutes: c.targetMinutes })
    }
  }
  return atRisk.sort((a, b) => a.remainingSeconds - b.remainingSeconds).slice(0, 50)
}

/**
 * `from` / `to` are inclusive dates (YYYY-MM-DD). `refresh` rebuilds the days that can still change, even if they were built today.
 */
export async function getSlaReport(from: string, to: string, opts: { refresh?: boolean } = {}): Promise<SlaReport> {
  const dates = datesBetween(from, to)
  const today = dayOf(new Date())

  const stored = new Map((await getMany(slaDaily, dates)).map((r) => [r.date, r]))
  const stale = dates.filter((d) => dayNeedsBuild(d, stored.get(d) as StoredDay | undefined, today, !!opts.refresh))

  const ctx = await loadSlaContext()
  if (stale.length) {
    const built = await buildDays(stale, ctx)
    await Promise.all(
      [...built].map(async ([date, { sla, csat }]) => {
        const row = await upsert(slaDaily, { date, sla, csat, slaFinal: slaDayIsFinal(date, today, sla), csatFinal: csatDayIsFinal(date, today), computedAt: new Date() }, { sla, csat, slaFinal: slaDayIsFinal(date, today, sla), csatFinal: csatDayIsFinal(date, today), computedAt: new Date() })
        stored.set(date, row)
      })
    )
  }

  const days = dates.map((d) => stored.get(d)).filter((r): r is NonNullable<typeof r> => !!r)
  const sla = mergeSla(days.map((d) => (d.sla as DaySla | null) ?? emptyDaySla()))
  const csat = mergeCsat(days.map((d) => (d.csat as DayCsat | null) ?? emptyDayCsat()))

  const [companyRows, typeRows] = await Promise.all([find(companies, { select: ['id', 'name', 'color'] }), find(ticketTypes, { select: ['id', 'title', 'color'] })])
  const companyById = new Map(companyRows.map((c) => [c.id, c]))
  const typeById = new Map(typeRows.map((t) => [String(t.id), t]))
  const people = await getManyMap(users, Object.keys(csat.byAgent).filter((k) => k !== '_none'))

  const groups = (m: Record<string, DayGroup>, name: (k: string) => { name: string; color: string | null }): SlaGroupRow[] =>
    Object.entries(m)
      .map(([key, g]) => ({ key, ...name(key), tickets: g.tickets, respond: g.respond, resolve: g.resolve }))
      .sort((a, b) => b.respond.missed + b.respond.breached + b.resolve.missed + b.resolve.breached - (a.respond.missed + a.respond.breached + a.resolve.missed + a.resolve.breached) || b.tickets - a.tickets)
  const csatRows = (m: Record<string, { n: number; sum: number }>, name: (k: string) => string): CsatRow[] =>
    Object.entries(m)
      .map(([key, a]) => ({ key, name: name(key), responses: a.n, average: avg(a.sum, a.n) }))
      .sort((a, b) => b.responses - a.responses || b.average - a.average)
  const companyName = (id: string | null) => (id ? (companyById.get(id)?.name ?? null) : null)

  return {
    from,
    to,
    totals: { tickets: sla.tickets, respond: sla.respond, resolve: sla.resolve },
    byCompany: groups(sla.byCompany, (k) => ({ name: k === '_none' ? 'No company' : (companyById.get(k)?.name ?? 'Deleted company'), color: k === '_none' ? null : (companyById.get(k)?.color ?? null) })),
    byType: groups(sla.byType, (k) => ({ name: k === '_none' ? 'No type' : (typeById.get(k)?.title ?? 'Deleted type'), color: k === '_none' ? null : (typeById.get(k)?.color ?? null) })),
    atRisk: await atRiskNow(ctx, companyName),
    csat: {
      responses: csat.n,
      average: csat.n ? avg(csat.sum, csat.n) : null,
      distribution: csat.dist,
      byAgent: csatRows(csat.byAgent, (k) => (k === '_none' ? 'Unassigned' : (people.get(k)?.fullName || people.get(k)?.email || 'Unknown'))),
      byCompany: csatRows(csat.byCompany, (k) => (k === '_none' ? 'No company' : (companyById.get(k)?.name ?? 'Deleted company'))),
      lowComments: csat.low.map((l) => ({ ticketId: l.ticketId, title: l.title, company: companyName(l.companyId), rating: l.rating, comment: l.comment, at: l.at })),
    },
  }
}
