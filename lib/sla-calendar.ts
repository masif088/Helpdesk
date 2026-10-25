/**
 * SLA time: which minutes count towards a clock. Pure helpers (no database imports), used by `lib/sla.ts` and by tests.
 *
 *   - Business hours: with the calendar switched on, a clock only runs inside the opening hours of each weekday, and not
 *     on holidays. Off = the clock runs all day, every day.
 *   - Pauses: a clock does not run while the ticket sits in a "ball with the client" status.
 *
 * All times are epoch milliseconds. The calendar lives in one fixed UTC offset (no daylight saving).
 */

const MIN = 60_000
const DAY = 86_400_000
const MAX_DAYS = 3700

/** [start, end) in epoch ms */
export type Interval = [number, number]

export type OpeningHours = { open: string; close: string }

export type SlaCalendar = {
  enabled: boolean
  /** Minutes east of UTC, e.g. 420 for Jakarta */
  utcOffsetMinutes: number
  /** Index 0 = Sunday ... 6 = Saturday; null = closed all day */
  week: (OpeningHours | null)[]
  /** Local dates (YYYY-MM-DD) with no clock running */
  holidays: string[]
}

export const DEFAULT_SLA_CALENDAR: SlaCalendar = {
  enabled: false,
  utcOffsetMinutes: 420,
  week: [null, ...Array.from({ length: 5 }, () => ({ open: '09:00', close: '17:00' })), null],
  holidays: [],
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/
const toMinutes = (t: string): number => {
  const m = TIME.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

/** Turn whatever was stored (JSON text or an object) into a valid calendar; anything unusable falls back to the default. */
export function cleanCalendar(raw: unknown): SlaCalendar {
  let o: unknown = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      return DEFAULT_SLA_CALENDAR
    }
  }
  if (!o || typeof o !== 'object') return DEFAULT_SLA_CALENDAR
  const c = o as Partial<SlaCalendar>
  const offset = Math.round(Number(c.utcOffsetMinutes))
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = Array.isArray(c.week) ? c.week[i] : undefined
    if (!d || typeof d !== 'object') return null
    const open = toMinutes(String(d.open))
    const close = toMinutes(String(d.close))
    return open < close ? { open: String(d.open), close: String(d.close) } : null
  })
  const holidays = Array.isArray(c.holidays)
    ? [...new Set(c.holidays.map(String).filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h)))].sort()
    : []
  return {
    enabled: c.enabled === true,
    utcOffsetMinutes: Number.isFinite(offset) && Math.abs(offset) <= 14 * 60 ? offset : DEFAULT_SLA_CALENDAR.utcOffsetMinutes,
    week,
    holidays,
  }
}

/** A calendar that restricts nothing: the clock runs around the clock. */
export const isAlwaysOn = (cal: SlaCalendar | undefined): boolean => !cal || !cal.enabled || cal.week.every((d) => !d)

/** The opening window of local day number `d` (days since 1970-01-01 in the calendar's own time), or null when closed. */
function windowOfDay(cal: SlaCalendar, d: number): Interval | null {
  if (cal.holidays.includes(new Date(d * DAY).toISOString().slice(0, 10))) return null
  const hours = cal.week[(((d + 4) % 7) + 7) % 7]
  if (!hours) return null
  const base = d * DAY - cal.utcOffsetMinutes * MIN
  return [base + toMinutes(hours.open) * MIN, base + toMinutes(hours.close) * MIN]
}

/** Calls `fn` for every running window from `from` on, in order; stops when `fn` returns true. */
function eachWindow(cal: SlaCalendar | undefined, from: number, fn: (start: number, end: number) => boolean): void {
  if (!cal || isAlwaysOn(cal)) {
    fn(from, Infinity)
    return
  }
  let d = Math.floor((from + cal.utcOffsetMinutes * MIN) / DAY)
  for (let i = 0; i < MAX_DAYS; i++, d++) {
    const w = windowOfDay(cal, d)
    if (!w || w[1] <= from) continue
    if (fn(Math.max(w[0], from), w[1])) return
  }
}

/** [a, b) without the paused intervals, as the pieces that are left. Paused intervals must be sorted and not overlap. */
function freeParts(a: number, b: number, paused: Interval[]): Interval[] {
  const out: Interval[] = []
  let at = a
  for (const [ps, pe] of paused) {
    if (pe <= at) continue
    if (ps >= b) break
    if (ps > at) out.push([at, ps])
    at = Math.max(at, pe)
    if (at >= b) break
  }
  if (at < b) out.push([at, b])
  return out
}

/** Milliseconds a clock has run between `from` and `to`. */
export function runningMs(cal: SlaCalendar | undefined, from: number, to: number, paused: Interval[] = []): number {
  if (to <= from) return 0
  let total = 0
  eachWindow(cal, from, (a, b) => {
    if (a >= to) return true
    for (const [s, e] of freeParts(a, Math.min(b, to), paused)) total += e - s
    return false
  })
  return total
}

/** The moment a clock that started at `from` has run for `minutes`. */
export function dueAtMs(cal: SlaCalendar | undefined, from: number, minutes: number, paused: Interval[] = []): number {
  let need = minutes * MIN
  let due = from + need
  eachWindow(cal, from, (a, b) => {
    for (const [s, e] of freeParts(a, b, paused)) {
      if (e - s >= need) {
        due = s + need
        return true
      }
      need -= e - s
    }
    return false
  })
  return due
}

/** Is a clock running at this moment (inside opening hours and not paused)? */
export function isRunningAt(cal: SlaCalendar | undefined, at: number, paused: Interval[] = []): boolean {
  if (paused.some(([s, e]) => at >= s && at < e)) return false
  if (!cal || isAlwaysOn(cal)) return true
  const w = windowOfDay(cal, Math.floor((at + cal.utcOffsetMinutes * MIN) / DAY))
  return !!w && at >= w[0] && at < w[1]
}

export type StatusChange = { at: number; from: string | null; to: string }

/**
 * Pauses of a ticket: every stretch spent in a status where the ball is with the client. The status before the first
 * logged change is that change's `from`; with no change at all it is the current status. A pause that is still going on
 * ends at `now`.
 */
export function pausedIntervals(changes: StatusChange[], currentStatus: string, createdAt: number, now: number, waiting: ReadonlySet<string>): Interval[] {
  if (!waiting.size) return []
  const sorted = [...changes].sort((a, b) => a.at - b.at)
  const out: Interval[] = []
  let status = sorted[0]?.from ?? currentStatus
  let since = createdAt
  const close = (until: number) => {
    if (waiting.has(status) && until > since) out.push([since, until])
  }
  for (const c of sorted) {
    close(c.at)
    status = c.to
    since = Math.max(since, c.at)
  }
  close(now)
  return out
}
