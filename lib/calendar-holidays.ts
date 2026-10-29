/**
 * Holidays added in the Calendar (type `holiday`) also stop the SLA clocks when business hours are on. This turns them into
 * the plain dates the SLA calendar understands (`lib/sla-calendar.ts`), repeating holidays included.
 */
import { expandOccurrences } from '@/lib/calendar-core'
import { calendarEvents, find } from '@/lib/fsdb'

const DAY = 86_400_000
/** Clocks of tickets that are still open can be old, so look well back as well as ahead */
const DAYS_BACK = 1100
const DAYS_AHEAD = 400
const CACHE_MS = 60_000

const g = globalThis as typeof globalThis & { __calendarHolidays?: { at: number; dates: Promise<string[]> } }

export async function calendarHolidayDates(now = new Date()): Promise<string[]> {
  const hit = g.__calendarHolidays
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.dates
  const dates = load(now)
  g.__calendarHolidays = { at: Date.now(), dates }
  dates.catch(() => {
    if (g.__calendarHolidays?.dates === dates) g.__calendarHolidays = undefined
  })
  return dates
}

/** Forget the cached list (after a holiday is added, changed or deleted) */
export function forgetCalendarHolidays(): void {
  g.__calendarHolidays = undefined
}

async function load(now: Date): Promise<string[]> {
  const rows = await find(calendarEvents, { where: [['type', '==', 'holiday']], limit: 1000 })
  const from = new Date(now.getTime() - DAYS_BACK * DAY)
  const to = new Date(now.getTime() + DAYS_AHEAD * DAY)
  const out = new Set<string>()
  for (const r of rows) {
    for (const o of expandOccurrences({ startAt: new Date(r.startAt), endAt: new Date(r.endAt), repeat: r.repeat as 'none', repeatUntil: r.repeatUntil ? new Date(r.repeatUntil) : null }, from, to)) {
      for (let d = Date.UTC(o.start.getUTCFullYear(), o.start.getUTCMonth(), o.start.getUTCDate()); d <= o.end.getTime() && out.size < 5000; d += DAY) out.add(new Date(d).toISOString().slice(0, 10))
    }
  }
  return [...out].sort()
}
