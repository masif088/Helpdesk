/**
 * "Who is working, and how loaded are they": the parts that need no database. Used by `lib/people-activity.ts`
 * (GET /api/users/activity), the API builder and the tests.
 *
 * The question it answers: in a period (days, or hours of a day), which team members worked on tickets, for how long, on what,
 * how much is on their plate, and are they away. Narrow it by person, client company or customer, the skills a ticket needs,
 * and ticket type.
 */
// Relative, with the extension, on purpose: the tests load this file with plain Node, which knows no `@/` alias
import { addDays, endOfDayInZone, isoInZone, localDateOf, parseDateBound, startOfDayInZone, todayInZone, zoneParts } from './app-time.ts'

const DAY = 86_400_000
const HOUR = 3_600_000
export const MAX_ACTIVITY_DAYS = 62
export const MAX_HOURLY_DAYS = 3

export type ActivityBreakdown = 'none' | 'day' | 'hour'

export type ActivityQuery = {
  from: Date
  to: Date
  /** The zone the dates, days and hours are read and written in (the app's time zone) */
  timeZone: string
  /** Only these team members (the word `me` stands for the caller) */
  userIds: string[]
  /** Only team members who have these skills themselves */
  agentSkills: string[]
  teamIds: string[]
  /** Only work on tickets of these client companies */
  companyIds: string[]
  /** Only work on tickets opened by, or with as contact, these client users */
  customerIds: string[]
  /** Only work on tickets that need these skills */
  skills: string[]
  skillsMatch: 'any' | 'all'
  typeIds: number[]
  /** Leave out people who did not work in the period */
  onlyWorking: boolean
  breakdown: ActivityBreakdown
  /** List the tickets each person worked on */
  includeTickets: boolean
  /** List each person's time entries (start, end, ticket), newest first */
  includeSessions: boolean
}

const list = (v: string | null): string[] => (v ? [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))] : [])
const flag = (v: string | null): boolean => v === '1' || v === 'true'

function moment(v: string | null, end: boolean, tz: string): Date | null | 'bad' {
  if (!v) return null
  return parseDateBound(v, tz, end) ?? 'bad'
}

/** Read and check the query string. A plain date means that whole day in `tz`; the default period is today in `tz`. */
export function parseActivityQuery(params: URLSearchParams, meId: string, now = new Date(), tz = 'UTC'): ActivityQuery | { error: string } {
  const f = moment(params.get('from'), false, tz)
  const t = moment(params.get('to'), true, tz)
  if (f === 'bad' || t === 'bad') return { error: 'from and to must be dates (YYYY-MM-DD) or ISO date and time, e.g. 2026-11-03T09:00:00Z' }
  const from = f ?? startOfDayInZone(todayInZone(tz, now), tz)
  const to = t ?? endOfDayInZone(localDateOf(from, tz), tz)
  if (to.getTime() < from.getTime()) return { error: 'to must not be before from' }
  if (to.getTime() - from.getTime() > MAX_ACTIVITY_DAYS * DAY) return { error: `Ask for at most ${MAX_ACTIVITY_DAYS} days at a time` }

  const match = params.get('skills_match')?.toLowerCase()
  if (match && match !== 'any' && match !== 'all') return { error: 'skills_match must be any or all' }
  const breakdown = (params.get('breakdown') ?? 'none').toLowerCase()
  if (breakdown !== 'none' && breakdown !== 'day' && breakdown !== 'hour') return { error: 'breakdown must be none, day or hour' }
  if (breakdown === 'hour' && to.getTime() - from.getTime() > MAX_HOURLY_DAYS * DAY) return { error: `breakdown=hour needs a period of at most ${MAX_HOURLY_DAYS} days` }
  const typeIds = list(params.get('type_ids')).map(Number)
  if (typeIds.some((n) => !Number.isInteger(n))) return { error: 'type_ids must be ticket type numbers' }

  return {
    from,
    to,
    timeZone: tz,
    userIds: list(params.get('user_ids')).map((u) => (u === 'me' ? meId : u)),
    agentSkills: list(params.get('agent_skills')),
    teamIds: list(params.get('team_ids')),
    companyIds: list(params.get('company_ids')),
    customerIds: list(params.get('customer_ids')),
    skills: list(params.get('skills')),
    skillsMatch: match === 'all' ? 'all' : 'any',
    typeIds,
    onlyWorking: flag(params.get('only_working')),
    breakdown,
    includeTickets: flag(params.get('include_tickets')),
    includeSessions: flag(params.get('include_sessions')),
  }
}

/** My working (a person's own page) looks at most this many days at a time. */
export const MAX_MY_WORKING_DAYS = 30

/**
 * The query behind the "My working" page: only the caller, with their tickets and every time entry. Takes `from`, `to` (dates or exact
 * moments in the app zone) and optionally `breakdown`; anything else in the query string is ignored. Without a `breakdown` a period of
 * up to 3 days is shown per hour and a longer one per day.
 */
export function parseMyWorkingQuery(params: URLSearchParams, meId: string, now = new Date(), tz = 'UTC'): ActivityQuery | { error: string } {
  const base = new URLSearchParams()
  for (const k of ['from', 'to', 'breakdown']) if (params.get(k)) base.set(k, params.get(k) as string)
  base.set('user_ids', 'me')
  base.set('include_tickets', '1')
  base.set('include_sessions', '1')
  const probe = parseActivityQuery(base, meId, now, tz)
  if ('error' in probe) return probe
  const span = probe.to.getTime() - probe.from.getTime()
  if (span > MAX_MY_WORKING_DAYS * DAY) return { error: `Ask for at most ${MAX_MY_WORKING_DAYS} days at a time` }
  if (base.has('breakdown')) return probe
  base.set('breakdown', span <= MAX_HOURLY_DAYS * DAY ? 'hour' : 'day')
  return parseActivityQuery(base, meId, now, tz)
}

/** Does the query narrow down tickets (so work on other tickets does not count)? */
export const hasTicketFilters = (q: ActivityQuery): boolean => q.companyIds.length > 0 || q.customerIds.length > 0 || q.skills.length > 0 || q.typeIds.length > 0

const key = (s: string) => s.trim().toLowerCase()

export type FilterableTicket = { companyId: string | null; typeId: number | null; createdBy: string | null; contactUserId: string | null }

/** Does a ticket pass the ticket filters? `skills` are the skills the ticket needs (see `effectiveSkillsFor`). */
export function ticketPassesActivityFilters(t: FilterableTicket, q: ActivityQuery, skills: string[]): boolean {
  if (q.companyIds.length && !(t.companyId && q.companyIds.includes(t.companyId))) return false
  if (q.typeIds.length && !(t.typeId != null && q.typeIds.includes(t.typeId))) return false
  if (q.customerIds.length && !((t.createdBy && q.customerIds.includes(t.createdBy)) || (t.contactUserId && q.customerIds.includes(t.contactUserId)))) return false
  if (q.skills.length) {
    const have = new Set(skills.map(key))
    const ok = q.skillsMatch === 'all' ? q.skills.every((s) => have.has(key(s))) : q.skills.some((s) => have.has(key(s)))
    if (!ok) return false
  }
  return true
}

export type Session = { startTime: Date | string; stopTime: Date | string | null; durationSeconds?: number | null; durationAdjustment?: number | null }

/** Same rule as billing: an explicit adjustment wins over the tracked duration. */
const reported = (s: Pick<Session, 'durationSeconds' | 'durationAdjustment'>): number => {
  const adj = s.durationAdjustment
  if (adj != null && Number.isFinite(adj)) return Math.max(0, Math.floor(adj))
  return Math.max(0, Math.floor(s.durationSeconds ?? 0))
}

/**
 * The part of a time entry that falls in [from, to]. A running timer counts up to `now` (or `to`). An entry that lies fully inside
 * the period counts its reported time (so adjustments count); one that crosses the edge counts only the overlapping span.
 * Null when it does not touch the period.
 */
export function sessionInRange(s: Session, from: Date, to: Date, now = new Date()): { start: Date; end: Date; seconds: number; running: boolean } | null {
  const start = new Date(s.startTime)
  const running = !s.stopTime
  const stop = running ? new Date(Math.min(now.getTime(), to.getTime())) : new Date(s.stopTime as Date | string)
  if (Number.isNaN(start.getTime()) || Number.isNaN(stop.getTime()) || stop.getTime() < from.getTime() || start.getTime() > to.getTime()) return null
  const inside = start.getTime() >= from.getTime() && stop.getTime() <= to.getTime()
  const a = new Date(Math.max(start.getTime(), from.getTime()))
  const b = new Date(Math.min(stop.getTime(), to.getTime()))
  const span = Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000))
  return { start: a, end: b, seconds: inside && !running ? reported(s) : span, running }
}

/** The start of the hour an instant is in, on the wall clock of the zone. */
function startOfHour(ms: number, tz: string): number {
  const p = zoneParts(new Date(ms), tz)
  return ms - (p.minute * 60 + p.second) * 1000 - (((ms % 1000) + 1000) % 1000)
}

/** The bucket an instant belongs to in the zone: a day `YYYY-MM-DD`, or an hour `YYYY-MM-DDTHH:00+07:00`. */
export function bucketOf(d: Date, breakdown: ActivityBreakdown, tz = 'UTC'): string {
  return breakdown === 'hour' ? isoInZone(new Date(startOfHour(d.getTime(), tz)), tz) : localDateOf(d, tz)
}

/** Split seconds worked between two instants over the buckets they cross (so a night shift counts on both days). */
export function splitIntoBuckets(start: Date, end: Date, seconds: number, breakdown: ActivityBreakdown, tz = 'UTC'): Map<string, number> {
  const out = new Map<string, number>()
  if (breakdown === 'none') return out
  const span = end.getTime() - start.getTime()
  if (span <= 0) {
    out.set(bucketOf(start, breakdown, tz), seconds)
    return out
  }
  // The next edge between buckets on the wall clock of the zone (a day can be 23 or 25 hours long where daylight saving changes)
  const nextEdge = (ms: number) => (breakdown === 'hour' ? startOfHour(ms, tz) + HOUR : startOfDayInZone(addDays(localDateOf(new Date(ms), tz), 1), tz).getTime())
  let at = start.getTime()
  let given = 0
  while (at < end.getTime()) {
    const edge = Math.min(end.getTime(), nextEdge(at))
    const share = Math.round((seconds * (edge - at)) / span)
    const key = bucketOf(new Date(at), breakdown, tz)
    out.set(key, (out.get(key) ?? 0) + share)
    given += share
    at = edge
  }
  // Rounding must not lose or invent seconds: put the difference on the last bucket
  if (given !== seconds) {
    const last = bucketOf(new Date(end.getTime() - 1), breakdown, tz)
    out.set(last, (out.get(last) ?? 0) + (seconds - given))
  }
  return out
}

export type Interval = { start: Date; end: Date }

/** Total length of the union of intervals, in seconds (overlapping entries are not counted twice). */
export function unionSeconds(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime())
  let total = 0
  let curStart = -1
  let curEnd = -1
  for (const i of sorted) {
    const s = i.start.getTime()
    const e = i.end.getTime()
    if (curEnd < 0 || s > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart
      curStart = s
      curEnd = e
    } else if (e > curEnd) curEnd = e
  }
  if (curEnd >= 0) total += curEnd - curStart
  return Math.floor(total / 1000)
}
