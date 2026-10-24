/**
 * The SLA & satisfaction report is built from one small summary per day, stored in Firestore (`sla_daily`, one document per date),
 * so "this week", "this month" or any range is just the sum of its days. Everything in a summary is additive (counts and
 * sums), never an average, which is what makes days safe to add up.
 *
 *   sla  - support tickets CREATED that day that have a target: answered / resolved in time, late, overdue, running
 *   csat - ratings GIVEN that day
 *
 * No database here, so this file is tested on its own (tests/sla-daily.test.mjs).
 */

export type Tally = { met: number; missed: number; breached: number; running: number }
export type DayGroup = { tickets: number; respond: Tally; resolve: Tally }
export type DaySla = DayGroup & { byCompany: Record<string, DayGroup>; byType: Record<string, DayGroup> }

export type CsatAgg = { n: number; sum: number }
export type LowComment = { ticketId: number; title: string; companyId: string | null; rating: number; comment: string; at: string }
export type DayCsat = { n: number; sum: number; dist: number[]; byAgent: Record<string, CsatAgg>; byCompany: Record<string, CsatAgg>; low: LowComment[] }

export const emptyTally = (): Tally => ({ met: 0, missed: 0, breached: 0, running: 0 })
export const emptyGroup = (): DayGroup => ({ tickets: 0, respond: emptyTally(), resolve: emptyTally() })
export const emptyDaySla = (): DaySla => ({ ...emptyGroup(), byCompany: {}, byType: {} })
export const emptyDayCsat = (): DayCsat => ({ n: 0, sum: 0, dist: [0, 0, 0, 0, 0], byAgent: {}, byCompany: {}, low: [] })

const addTally = (a: Tally, b: Tally) => {
  a.met += b.met
  a.missed += b.missed
  a.breached += b.breached
  a.running += b.running
}
const addGroup = (a: DayGroup, b: DayGroup) => {
  a.tickets += b.tickets
  addTally(a.respond, b.respond)
  addTally(a.resolve, b.resolve)
}
const addAgg = (m: Record<string, CsatAgg>, key: string, n: number, sum: number) => {
  const a = (m[key] ??= { n: 0, sum: 0 })
  a.n += n
  a.sum += sum
}

/** Every date from `from` to `to`, both included (YYYY-MM-DD). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end && out.length < 800) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** The numbers of a day can still change while a clock of one of its tickets runs or is overdue. */
export const slaDayIsFinal = (date: string, today: string, d: DaySla) => date < today && d.respond.running + d.respond.breached + d.resolve.running + d.resolve.breached === 0

/** Ratings of a day are settled once the day is over. */
export const csatDayIsFinal = (date: string, today: string) => date < today

/** Past days older than this are not rebuilt any more, even when a clock was still running when they were stored. */
export const REBUILD_DAYS = 90

export type StoredDay = { slaFinal: boolean; csatFinal: boolean; computedAt: Date | string }

/**
 * Does this day need to be (re)built? A missing day always does. A settled day never does. Any other day is rebuilt once a day,
 * or whenever "Refresh" is pressed, as long as it is recent enough.
 */
export function dayNeedsBuild(date: string, stored: StoredDay | undefined, today: string, refresh: boolean): boolean {
  if (!stored) return true
  if (stored.slaFinal && stored.csatFinal) return false
  const age = (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000
  if (age > REBUILD_DAYS) return false
  return refresh || new Date(stored.computedAt).toISOString().slice(0, 10) < today
}

export function mergeSla(days: DaySla[]) {
  const total = emptyDaySla()
  for (const d of days) {
    addGroup(total, d)
    for (const [k, g] of Object.entries(d.byCompany)) addGroup((total.byCompany[k] ??= emptyGroup()), g)
    for (const [k, g] of Object.entries(d.byType)) addGroup((total.byType[k] ??= emptyGroup()), g)
  }
  return total
}

export function mergeCsat(days: DayCsat[], lowLimit = 20) {
  const total = emptyDayCsat()
  for (const d of days) {
    total.n += d.n
    total.sum += d.sum
    d.dist.forEach((v, i) => (total.dist[i] += v))
    for (const [k, a] of Object.entries(d.byAgent)) addAgg(total.byAgent, k, a.n, a.sum)
    for (const [k, a] of Object.entries(d.byCompany)) addAgg(total.byCompany, k, a.n, a.sum)
    total.low.push(...d.low)
  }
  total.low = total.low.sort((a, b) => b.at.localeCompare(a.at)).slice(0, lowLimit)
  return total
}

export { addAgg }
