/**
 * Service levels (SLA): how fast a ticket must be answered and finished.
 *
 * Targets are set per ticket type (Settings -> Ticket types, the default) and can be overridden per client
 * (Company -> SLA), including a "default" row for that client's other tickets. For each of respond / resolve:
 *   client + this type  >  client "default"  >  the ticket type's own default  >  no target
 *
 * Clocks run in calendar minutes from the moment the ticket was created:
 *   respond  = first public reply from the team (only for tickets opened by a client: portal or email)
 *   resolve  = the ticket reaches a finished status (resolved / closed / completed)
 * Only support tickets have a service level. A ticket that was cancelled / archived / is pending has no running clock.
 */
import {
  companies,
  find,
  get,
  getManyMap,
  type SlaTarget,
  ticketActivityLog,
  ticketComments,
  tickets,
  type TicketsRow,
  ticketTypes,
  update,
  users,
} from '@/lib/fsdb'
import { MAX_SLA_MINUTES, type SlaClock, type SlaState, type TicketSla } from '@/lib/sla-format'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export type { SlaClock, SlaState, TicketSla } from '@/lib/sla-format'
export { formatSlaDuration, formatSlaTarget, MAX_SLA_MINUTES } from '@/lib/sla-format'

export const FINISHED_STATUSES = new Set(['resolved', 'closed', 'completed'])

/** Key of a client's catch-all row in `companies.slaByType` */
export const SLA_DEFAULT_KEY = 'default'

/** Share of the target left under which the clock is "at risk" */
const AT_RISK_FRACTION = 0.2

export type SlaContext = {
  types: Map<number, SlaTarget>
  companies: Map<string, Record<string, SlaTarget>>
}

type TicketForSla = Pick<TicketsRow, 'id' | 'status' | 'ticketType' | 'typeId' | 'companyId' | 'createdAt'>

/** A target must be a whole number of minutes between 1 and a year; anything else means "none". */
export function cleanMinutes(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Math.round(Number(raw))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_SLA_MINUTES) : null
}

export function cleanTarget(raw: unknown): SlaTarget | null {
  const o = (raw ?? {}) as { respond?: unknown; resolve?: unknown }
  const respond = cleanMinutes(o.respond)
  const resolve = cleanMinutes(o.resolve)
  return respond == null && resolve == null ? null : { respond, resolve }
}

export async function loadSlaContext(): Promise<SlaContext> {
  const [typeRows, companyRows] = await Promise.all([
    find(ticketTypes, { select: ['id', 'slaRespondMinutes', 'slaResolveMinutes'] }),
    find(companies, { select: ['id', 'slaByType'] }),
  ])
  return {
    types: new Map(typeRows.map((t) => [t.id, { respond: t.slaRespondMinutes ?? null, resolve: t.slaResolveMinutes ?? null }])),
    companies: new Map(companyRows.filter((c) => c.slaByType).map((c) => [c.id, c.slaByType!])),
  }
}

/** The targets for a ticket (support tickets only), or null when nothing is set. */
export function slaTargetFor(ctx: SlaContext, t: Pick<TicketsRow, 'ticketType' | 'typeId' | 'companyId'>): SlaTarget | null {
  if ((t.ticketType ?? DEFAULT_TICKET_TYPE) !== DEFAULT_TICKET_TYPE) return null
  const byType = (t.companyId && ctx.companies.get(t.companyId)) || {}
  const own = t.typeId != null ? byType[String(t.typeId)] : undefined
  const fallback = byType[SLA_DEFAULT_KEY]
  const typeDefault = t.typeId != null ? ctx.types.get(t.typeId) : undefined
  const respond = own?.respond ?? fallback?.respond ?? typeDefault?.respond ?? null
  const resolve = own?.resolve ?? fallback?.resolve ?? typeDefault?.resolve ?? null
  return respond == null && resolve == null ? null : { respond, resolve }
}

function clock(createdAt: Date, targetMinutes: number, doneAt: Date | null, now: Date): SlaClock {
  const due = new Date(new Date(createdAt).getTime() + targetMinutes * 60_000)
  if (doneAt) {
    return {
      targetMinutes,
      dueAt: due.toISOString(),
      doneAt: doneAt.toISOString(),
      state: doneAt.getTime() <= due.getTime() ? 'met' : 'missed',
      remainingSeconds: null,
    }
  }
  const remaining = Math.round((due.getTime() - now.getTime()) / 1000)
  const state: SlaState = remaining < 0 ? 'breached' : remaining < targetMinutes * 60 * AT_RISK_FRACTION ? 'at_risk' : 'ok'
  return { targetMinutes, dueAt: due.toISOString(), doneAt: null, state, remainingSeconds: remaining }
}

/**
 * `openedByClient`: the respond clock only applies to tickets a client opened. `firstReplyAt` = first public reply
 * from the team; `finishedAt` = when the ticket last reached a finished status.
 */
export function computeSla(
  t: TicketForSla,
  target: SlaTarget | null,
  opts: { openedByClient: boolean; firstReplyAt: Date | null; finishedAt: Date | null; now?: Date }
): TicketSla {
  if (!target) return { respond: null, resolve: null }
  const now = opts.now ?? new Date()
  const finished = FINISHED_STATUSES.has(t.status)
  const stopped = isClosedLikeTicketStatus(t.status) && !finished
  let respond: SlaClock | null = null
  if (target.respond != null && opts.openedByClient) {
    if (opts.firstReplyAt) respond = clock(t.createdAt, target.respond, opts.firstReplyAt, now)
    else if (!stopped && !finished) respond = clock(t.createdAt, target.respond, null, now)
  }
  let resolve: SlaClock | null = null
  if (target.resolve != null) {
    if (finished) resolve = clock(t.createdAt, target.resolve, opts.finishedAt ?? now, now)
    else if (!stopped) resolve = clock(t.createdAt, target.resolve, null, now)
  }
  return { respond, resolve }
}

/** When a ticket's finishing status change was logged (the latest one); null when never logged. */
export function finishedAtFromLog(log: { action: string; metadata: unknown; createdAt: Date }[]): Date | null {
  let at: Date | null = null
  for (const l of log) {
    if (l.action !== 'ticket_updated') continue
    const to = (l.metadata as { changes?: { status?: { to?: unknown } } } | null)?.changes?.status?.to
    if (typeof to !== 'string' || !FINISHED_STATUSES.has(to)) continue
    if (!at || l.createdAt > at) at = l.createdAt
  }
  return at
}

/** First public reply by the team among a ticket's comments. */
export function firstTeamReply(comments: { authorType: string | null; visibility: string | null; createdAt: Date }[]): Date | null {
  let at: Date | null = null
  for (const c of comments) {
    if (c.authorType !== 'agent' || (c.visibility !== 'reply' && c.visibility !== 'public')) continue
    if (!at || c.createdAt < at) at = c.createdAt
  }
  return at
}

/** A ticket was opened by a client (portal or email) rather than by the team. */
export async function ticketsOpenedByClient(rows: Pick<TicketsRow, 'id' | 'createdBy' | 'createdVia'>[]): Promise<Set<number>> {
  const creators = await getManyMap(users, [...new Set(rows.map((t) => t.createdBy).filter((id): id is string => !!id))])
  return new Set(rows.filter((t) => t.createdVia === 'email' || (!!t.createdBy && creators.get(t.createdBy)?.role?.toLowerCase() === 'customer')).map((t) => t.id))
}

/**
 * When the team first replied publicly. Stored on the ticket when it happens; for older tickets it is read from the
 * comments once and stored then.
 */
export async function firstResponseAt(t: Pick<TicketsRow, 'id' | 'firstRespondedAt'>): Promise<Date | null> {
  if (t.firstRespondedAt) return new Date(t.firstRespondedAt)
  const at = firstTeamReply(await find(ticketComments, { where: [['ticketId', '==', t.id]], select: ['authorType', 'visibility', 'createdAt'] }))
  if (at) await update(tickets, t.id, { firstRespondedAt: at })
  return at
}

/** Record the team's first public reply on a ticket (no-op when it is already recorded). */
export async function markFirstResponse(ticketId: number, at = new Date()): Promise<void> {
  const t = await get(tickets, ticketId)
  if (t && !t.firstRespondedAt) await update(tickets, ticketId, { firstRespondedAt: at })
}

/**
 * Running clocks for a page of the ticket list (open support tickets with a target). Finished tickets get none.
 * `openedByClient` is computed by the caller from the row's creator.
 */
export async function slaForList(
  rows: { ticket: Pick<TicketsRow, 'id' | 'status' | 'ticketType' | 'typeId' | 'companyId' | 'createdAt' | 'firstRespondedAt'>; openedByClient: boolean }[]
): Promise<Map<number, TicketSla>> {
  const out = new Map<number, TicketSla>()
  const ctx = await loadSlaContext()
  const needReply: typeof rows = []
  for (const r of rows) {
    const target = slaTargetFor(ctx, r.ticket)
    if (!target || FINISHED_STATUSES.has(r.ticket.status) || isClosedLikeTicketStatus(r.ticket.status)) continue
    if (target.respond != null && r.openedByClient && !r.ticket.firstRespondedAt) needReply.push(r)
  }
  // Older tickets without the stored first reply: look it up once (bounded per page), which also stores it
  const healed = new Map<number, Date | null>()
  await Promise.all(needReply.slice(0, 60).map(async (r) => healed.set(r.ticket.id, await firstResponseAt(r.ticket))))
  for (const r of rows) {
    const target = slaTargetFor(ctx, r.ticket)
    if (!target || FINISHED_STATUSES.has(r.ticket.status) || isClosedLikeTicketStatus(r.ticket.status)) continue
    const sla = computeSla(r.ticket, target, {
      openedByClient: r.openedByClient,
      firstReplyAt: r.ticket.firstRespondedAt ? new Date(r.ticket.firstRespondedAt) : (healed.get(r.ticket.id) ?? null),
      finishedAt: null,
    })
    if (sla.respond || sla.resolve) out.set(r.ticket.id, sla)
  }
  return out
}

/** Everything needed for one ticket's SLA (detail page, alerts). Null when the ticket has no service level. */
export async function getTicketSla(ticketId: number, ctx?: SlaContext): Promise<TicketSla | null> {
  const t = await get(tickets, ticketId)
  if (!t) return null
  const target = slaTargetFor(ctx ?? (await loadSlaContext()), t)
  if (!target) return null
  const [firstReplyAt, log, opened] = await Promise.all([
    firstResponseAt(t),
    find(ticketActivityLog, { where: [['ticketId', '==', ticketId]], select: ['action', 'metadata', 'createdAt'] }),
    ticketsOpenedByClient([t]),
  ])
  return computeSla(t, target, {
    openedByClient: opened.has(t.id),
    firstReplyAt,
    finishedAt: finishedAtFromLog(log) ?? (FINISHED_STATUSES.has(t.status) ? t.updatedAt : null),
  })
}
